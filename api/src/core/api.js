import cors from "cors";
import http from "node:http";
import rateLimit from "express-rate-limit";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { getCommit, getBranch, getRemote, getVersion } from "@snag/version-info";

import jwt from "../security/jwt.js";
import stream from "../stream/stream.js";
import match from "../processing/match.js";

import { env } from "../config.js";
import { extract } from "../processing/url.js";
import { Bright, Cyan } from "../misc/console-text.js";
import { hashHmac } from "../security/secrets.js";
import { createStore } from "../store/redis-ratelimit.js";
import { randomizeCiphers } from "../misc/randomize-ciphers.js";
import { verifyTurnstileToken } from "../security/turnstile.js";
import { friendlyServiceName } from "../processing/service-alias.js";
import { verifyStream } from "../stream/manage.js";
import { createResponse, normalizeRequest, getIP } from "../processing/request.js";
import { apiSchema } from "../processing/schema.js";
import { setupTunnelHandler } from "./itunnel.js";

import * as APIKeys from "../security/api-keys.js";
import * as Cookies from "../processing/cookie/manager.js";
import * as YouTubeSession from "../processing/helpers/youtube-session.js";

const git = {
    branch: await getBranch(),
    commit: await getCommit(),
    remote: await getRemote(),
}

const version = await getVersion();

const acceptRegex = /^application\/json(; charset=utf-8)?$/;

const corsConfig = env.corsWildcard ? {} : {
    origin: env.corsURL,
    optionsSuccessStatus: 200
}

const fail = (res, code, context) => {
    const { status, body } = createResponse("error", { code, context });
    res.status(status).json(body);
}

export const runAPI = async (express, app, __dirname, isPrimary = true) => {
    const startTime = new Date();
    const startTimestamp = startTime.getTime();

    const getServerInfo = () => {
        return JSON.stringify({
            snag: {
                version: version,
                url: env.apiURL,
                startTime: `${startTimestamp}`,
                turnstileSitekey: env.sessionEnabled ? env.turnstileSitekey : undefined,
                services: [...env.enabledServices].map(e => {
                    return friendlyServiceName(e);
                }),
            },
            git,
        });
    }

    const serverInfo = getServerInfo();

    const handleRateExceeded = (_, res) => {
        const { body } = createResponse("error", {
            code: "error.api.rate_exceeded",
            context: {
                limit: env.rateLimitWindow
            }
        });
        return res.status(429).json(body);
    };

    const keyGenerator = (req) => hashHmac(getIP(req), 'rate').toString('base64url');

    const sessionLimiter = rateLimit({
        windowMs: env.sessionRateLimitWindow * 1000,
        limit: env.sessionRateLimit,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator,
        store: await createStore('session'),
        handler: handleRateExceeded
    });

    const apiLimiter = rateLimit({
        windowMs: env.rateLimitWindow * 1000,
        limit: (req) => req.rateLimitMax || env.rateLimitMax,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator: req => req.rateLimitKey || keyGenerator(req),
        store: await createStore('api'),
        handler: handleRateExceeded
    });

    const apiTunnelLimiter = rateLimit({
        windowMs: env.tunnelRateLimitWindow * 1000,
        limit: env.tunnelRateLimitMax,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        keyGenerator: req => keyGenerator(req),
        store: await createStore('tunnel'),
        handler: (_, res) => {
            return res.sendStatus(429);
        }
    });

    app.set('trust proxy', ['loopback', 'uniquelocal']);

    // baseline security headers. we don't pull in `helmet` to keep the
    // dep tree small — these four cover the common audit findings:
    //   X-Content-Type-Options: prevents MIME sniffing on JSON bodies.
    //   Referrer-Policy: avoids leaking download URLs to third parties.
    //   X-Frame-Options: blocks clickjacking via iframe embed.
    //   Strict-Transport-Security: only meaningful behind TLS, but
    //     harmless on plain http and avoids forgotten-flag risk on prod.
    // CSP intentionally omitted: the api serves JSON + binary streams,
    // not html, so CSP would be no-op. webdocs deployment owns its own
    // CSP at the static-host layer.
    app.use((_, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains'
        );
        next();
    });

    app.use('/', cors({
        methods: ['GET', 'POST'],
        exposedHeaders: [
            'Ratelimit-Limit',
            'Ratelimit-Policy',
            'Ratelimit-Remaining',
            'Ratelimit-Reset'
        ],
        ...corsConfig,
    }));

    // F4 — POST /batch shares the same auth / rate-limit / parsing chain
    // as POST /. apply each middleware to both paths.
    const apiPaths = ['/', '/batch'];

    app.post(apiPaths, (req, res, next) => {
        if (!acceptRegex.test(req.header('Accept'))) {
            return fail(res, "error.api.header.accept");
        }
        if (!acceptRegex.test(req.header('Content-Type'))) {
            return fail(res, "error.api.header.content_type");
        }
        next();
    });

    app.post(apiPaths, (req, res, next) => {
        if (!env.apiKeyURL) {
            return next();
        }

        const { success, error } = APIKeys.validateAuthorization(req);
        if (!success) {
            // We call next() here if either if:
            // a) we have user sessions enabled, meaning the request
            //    will still need a Bearer token to not be rejected, or
            // b) we do not require the user to be authenticated, and
            //    so they can just make the request with the regular
            //    rate limit configuration;
            // otherwise, we reject the request.
            if (
                (env.sessionEnabled || !env.authRequired)
                && ['missing', 'not_api_key'].includes(error)
            ) {
                return next();
            }

            return fail(res, `error.api.auth.key.${error}`);
        }

        req.authType = "key";
        return next();
    });

    app.post(apiPaths, (req, res, next) => {
        if (!env.sessionEnabled || req.rateLimitKey) {
            return next();
        }

        try {
            const authorization = req.header("Authorization");
            if (!authorization) {
                return fail(res, "error.api.auth.jwt.missing");
            }

            if (authorization.length >= 256) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            const [ type, token, ...rest ] = authorization.split(" ");
            if (!token || type.toLowerCase() !== 'bearer' || rest.length) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            if (!jwt.verify(token, getIP(req, 32))) {
                return fail(res, "error.api.auth.jwt.invalid");
            }

            req.rateLimitKey = hashHmac(token, 'rate');
            req.authType = "session";
        } catch {
            return fail(res, "error.api.generic");
        }
        next();
    });

    app.post(apiPaths, apiLimiter);

    // route-scoped body parsers so that POST / cannot accidentally accept a
    // larger body just because /batch is registered with a higher limit.
    // matching is exact per path (express's `app.use('/batch', ...)` matches
    // any path that *starts* with /batch — too broad — whereas the route
    // method form below scopes parsing to the actual endpoint).
    const parseSmallJSON = express.json({ limit: 1024 });
    const parseBatchJSON = express.json({ limit: 16 * 1024 });

    const jsonErrorHandler = (err, _req, res, next) => {
        if (err) {
            const { status, body } = createResponse("error", {
                code: "error.api.invalid_body",
            });
            return res.status(status).json(body);
        }
        next();
    };

    app.post("/session", sessionLimiter, async (req, res) => {
        if (!env.sessionEnabled) {
            return fail(res, "error.api.auth.not_configured")
        }

        const turnstileResponse = req.header("cf-turnstile-response");

        if (!turnstileResponse) {
            return fail(res, "error.api.auth.turnstile.missing");
        }

        const turnstileResult = await verifyTurnstileToken(
            turnstileResponse,
            req.ip
        );

        if (!turnstileResult) {
            return fail(res, "error.api.auth.turnstile.invalid");
        }

        try {
            res.json(jwt.generate(getIP(req, 32)));
        } catch {
            return fail(res, "error.api.generic");
        }
    });

    // process a single request body. returns the {status, body} shape used
    // by createResponse — never throws. shared by POST / and POST /batch.
    const processOne = async (request, req) => {
        if (!request || !request.url) {
            return createResponse("error", { code: "error.api.link.missing" });
        }

        const { success, data: normalizedRequest } = await normalizeRequest(request);
        if (!success) {
            return createResponse("error", { code: "error.api.invalid_body" });
        }

        const parsed = extract(
            normalizedRequest.url,
            APIKeys.getAllowedServices(req.rateLimitKey),
        );

        if (!parsed) {
            return createResponse("error", { code: "error.api.link.invalid" });
        }

        if ("error" in parsed) {
            return createResponse("error", {
                code: `error.api.${parsed.error}`,
                context: parsed?.context,
            });
        }

        try {
            return await match({
                host: parsed.host,
                patternMatch: parsed.patternMatch,
                params: normalizedRequest,
                authType: req.authType ?? "none",
            });
        } catch {
            return createResponse("error", { code: "error.api.generic" });
        }
    };

    app.post('/', parseSmallJSON, jsonErrorHandler, async (req, res) => {
        const result = await processOne(req.body, req);
        res.status(result.status).json(result.body);
    });

    // F4 — batch endpoint. submits N URLs sharing the same options, returns
    // an array of standard responses. processed with bounded concurrency to
    // avoid hammering the upstream services from a single batch.
    const BATCH_LIMIT = 50;
    const BATCH_CONCURRENCY = 4;

    // every key the per-url path is allowed to accept. shared options that
    // aren't in this list are dropped before fanout so a single typo doesn't
    // produce N copies of error.api.invalid_body.
    const ALLOWED_BATCH_OPTS = new Set(Object.keys(apiSchema.shape).filter(k => k !== 'url'));

    app.post('/batch', parseBatchJSON, jsonErrorHandler, async (req, res) => {
        const body = req.body || {};
        const urls = body.urls;
        if (!Array.isArray(urls) || urls.length === 0 || urls.length > BATCH_LIMIT) {
            return fail(res, "error.api.batch.invalid_size");
        }
        if (urls.some(u => typeof u !== 'string' || !u.length)) {
            return fail(res, "error.api.batch.invalid_url");
        }

        // collect ONLY recognised option keys from the body. unknown keys
        // (typos, future-not-supported fields) get reported once at the
        // batch level instead of producing N identical schema errors.
        const sharedOpts = {};
        const unknownKeys = [];
        for (const [k, v] of Object.entries(body)) {
            if (k === 'urls') continue;
            if (ALLOWED_BATCH_OPTS.has(k)) {
                sharedOpts[k] = v;
            } else {
                unknownKeys.push(k);
            }
        }
        if (unknownKeys.length > 0) {
            return fail(res, "error.api.batch.unknown_options", { keys: unknownKeys });
        }

        const results = new Array(urls.length);
        for (let i = 0; i < urls.length; i += BATCH_CONCURRENCY) {
            const slice = urls.slice(i, i + BATCH_CONCURRENCY);
            const sliceResults = await Promise.all(
                slice.map((url) => processOne({ ...sharedOpts, url }, req))
            );
            for (let j = 0; j < sliceResults.length; j++) {
                results[i + j] = sliceResults[j].body;
            }
        }

        res.json({ status: "batch", results });
    });

    app.use('/tunnel', cors({
        methods: ['GET'],
        exposedHeaders: [
            'Estimated-Content-Length',
            'Content-Disposition'
        ],
        ...corsConfig,
    }));

    app.get('/tunnel', apiTunnelLimiter, async (req, res) => {
        const id = String(req.query.id);
        const exp = String(req.query.exp);
        const sig = String(req.query.sig);
        const sec = String(req.query.sec);
        const iv = String(req.query.iv);

        const checkQueries = id && exp && sig && sec && iv;
        const checkBaseLength = id.length === 21 && exp.length === 13;
        const checkSafeLength = sig.length === 43 && sec.length === 43 && iv.length === 22;

        if (!checkQueries || !checkBaseLength || !checkSafeLength) {
            return res.status(400).end();
        }

        if (req.query.p) {
            return res.status(200).end();
        }

        const streamInfo = await verifyStream(id, sig, exp, sec, iv);
        if (!streamInfo?.service) {
            // log expired/invalid tunnel hits so we can tell the difference
            // between "you waited too long" (404) vs "ffmpeg blew up" (200
            // with truncated body) vs "bad signature" (401).
            console.log(`[tunnel] ${req.method} ${id} → ${streamInfo.status} (no service)`);
            return res.status(streamInfo.status).end();
        }

        console.log(`[tunnel] ${req.method} ${id} → ${streamInfo.service}/${streamInfo.type}`);

        if (streamInfo.type === 'proxy') {
            streamInfo.range = req.headers['range'];
        }

        return stream(res, streamInfo);
    });

    app.get('/', (_, res) => {
        res.type('json');
        res.status(200).send(env.envFile ? getServerInfo() : serverInfo);
    })

    app.get('/favicon.ico', (req, res) => {
        res.status(404).end();
    })

    app.get('/*', (req, res) => {
        res.redirect('/');
    })

    // handle all express errors
    app.use((_, __, res, ___) => {
        return fail(res, "error.api.generic");
    })

    randomizeCiphers();
    setInterval(randomizeCiphers, 1000 * 60 * 30); // shuffle ciphers every 30 minutes

    env.subscribe(['externalProxy', 'httpProxyValues'], () => {
        // TODO: remove env.externalProxy in a future version
        const options = {};
        if (env.externalProxy) {
            options.httpProxy = env.externalProxy;
        }

        setGlobalDispatcher(
            new EnvHttpProxyAgent(options)
        );
    });

    http.createServer(app).listen({
        port: env.apiPort,
        host: env.listenAddress,
        reusePort: env.instanceCount > 1 || undefined
    }, () => {
        if (isPrimary) {
            console.log(`\n` +
                Bright(Cyan("snag ")) + Bright("API ^ω^") + "\n" +

                "~~~~~~\n" +
                Bright("version: ") + version + "\n" +
                Bright("commit: ") + git.commit + "\n" +
                Bright("branch: ") + git.branch + "\n" +
                Bright("remote: ") + git.remote + "\n" +
                Bright("start time: ") + startTime.toUTCString() + "\n" +
                "~~~~~~\n" +

                Bright("url: ") + Bright(Cyan(env.apiURL)) + "\n" +
                Bright("port: ") + env.apiPort + "\n"
            );
        }

        if (env.apiKeyURL) {
            APIKeys.setup(env.apiKeyURL);
        }

        if (env.cookiePath) {
            Cookies.setup(env.cookiePath);
        }

        if (env.ytSessionServer) {
            YouTubeSession.setup();
        }
    });

    setupTunnelHandler();
}
