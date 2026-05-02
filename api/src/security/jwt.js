import { nanoid } from "nanoid";
import { createHmac, timingSafeEqual } from "crypto";

import { env } from "../config.js";

// constant-time HMAC compare; rejects mismatched lengths fast.
const safeEqualBase64Url = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const toBase64URL = (b) => Buffer.from(b).toString("base64url");
const fromBase64URL = (b) => Buffer.from(b, "base64url").toString();

const makeHmac = (data) => {
    return createHmac("sha256", env.jwtSecret)
            .update(data)
            .digest("base64url");
}

const sign = (header, payload) =>
        makeHmac(`${header}.${payload}`);

const getIPHash = (ip) =>
        makeHmac(ip).slice(0, 8);

const generate = (ip) => {
    const exp = Math.floor(new Date().getTime() / 1000) + env.jwtLifetime;

    const header = toBase64URL(JSON.stringify({
        alg: "HS256",
        typ: "JWT"
    }));

    const payload = toBase64URL(JSON.stringify({
        jti: nanoid(8),
        sub: getIPHash(ip),
        exp,
    }));

    const signature = sign(header, payload);

    return {
        token: `${header}.${payload}.${signature}`,
        exp: env.jwtLifetime - 2,
    };
}

const verify = (jwt, ip) => {
    const [header, payload, signature] = jwt.split(".", 3);
    const timestamp = Math.floor(new Date().getTime() / 1000);

    if ([header, payload, signature].join('.') !== jwt) {
        return false;
    }

    const verifySignature = sign(header, payload);

    if (!safeEqualBase64Url(verifySignature, signature)) {
        return false;
    }

    const data = JSON.parse(fromBase64URL(payload));

    return getIPHash(ip) === data.sub
            && timestamp <= data.exp;
}

export default {
    generate,
    verify,
}
