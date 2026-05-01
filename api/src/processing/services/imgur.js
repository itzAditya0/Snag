import { env, genericUserAgent } from "../../config.js";

// Imgur went SPA-only — og: tags are no longer in the initial HTML.
// strategy:
//   1. direct media URLs (i.imgur.com/<id>.<ext>) — return as redirect.
//   2. single posts (imgur.com/<id>) — if IMGUR_CLIENT_ID env is set, use the
//      Imgur API for accurate metadata. otherwise probe i.imgur.com/<id>.<ext>
//      across common extensions and return the first that resolves to real
//      content (not the "removed.png" placeholder).
//   3. albums / galleries — Imgur API only. without IMGUR_CLIENT_ID, return
//      a configuration-required error so the operator knows what to do.

const IMGUR_API = "https://api.imgur.com/3";
const REMOVED = "removed.png";

// probe order matters: video extensions first so a video-having post
// resolves to mp4 instead of imgur's synthesised still-image jpg, which
// gets served at the same URL stem. each entry pins the expected
// content-type kind so we don't mistake a fallback still for the real
// content.
const probeOrder = [
    { ext: "mp4", kind: "video" },
    { ext: "webp", kind: "image" }, // animated webp counts here
    { ext: "gif", kind: "image" },
    { ext: "jpg", kind: "image" },
    { ext: "jpeg", kind: "image" },
    { ext: "png", kind: "image" },
];
const videoExts = new Set(["mp4", "webm", "mov", "gifv"]);

const apiHeaders = () => ({
    "user-agent": genericUserAgent,
    accept: "application/json",
    authorization: `Client-ID ${env.imgurClientId}`,
});

const fetchJSON = async (url) => {
    try {
        const r = await fetch(url, { headers: apiHeaders() });
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    }
};

const inferExtFromUrl = (url) => {
    const m = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|#|$)/);
    return m?.[1]?.toLowerCase() ?? "jpg";
};

const normaliseExt = (ext) => (ext === "gifv" ? "mp4" : ext.toLowerCase());

const itemTypeFor = (ext) => {
    if (videoExts.has(ext)) return "video";
    if (ext === "gif") return "gif";
    return "photo";
};

const handleDirect = ({ id, ext }) => {
    const finalExt = normaliseExt(ext);
    return {
        urls: `https://i.imgur.com/${id}.${finalExt}`,
        filename: `imgur_${id}.${finalExt}`,
        ...(videoExts.has(finalExt) ? {} : { isPhoto: true }),
    };
};

const probeId = async (id) => {
    for (const { ext, kind } of probeOrder) {
        const url = `https://i.imgur.com/${id}.${ext}`;
        try {
            const r = await fetch(url, {
                method: "HEAD",
                redirect: "follow",
                headers: { "user-agent": genericUserAgent },
            });
            // accept only if:
            //   - final URL is still on the i.imgur.com CDN (not redirected
            //     to imgur.com/ for deleted videos)
            //   - not the removed.png placeholder
            //   - content-type matches the kind we asked for. imgur happily
            //     synthesises a still jpg at i.imgur.com/<id>.jpg even for
            //     posts whose primary asset is a video, so checking for
            //     "image/jpeg" is essential when probing image extensions.
            const finalUrl = r.url || url;
            const onCdn = finalUrl.startsWith("https://i.imgur.com/");
            const contentType = (r.headers.get("content-type") || "").toLowerCase();
            const kindMatches =
                (kind === "video" && contentType.startsWith("video/")) ||
                (kind === "image" && contentType.startsWith("image/"));
            if (r.ok && onCdn && !finalUrl.includes(REMOVED) && kindMatches) {
                return { url, ext };
            }
        } catch {
            /* try next */
        }
    }
    return null;
};

const handleSingleViaApi = async (id) => {
    const json = await fetchJSON(`${IMGUR_API}/image/${id}`);
    if (!json?.success || !json.data) return null;
    const { link, type } = json.data;
    if (!link) return null;
    const ext = normaliseExt(inferExtFromUrl(link));
    const finalLink = link.replace(/\.gifv$/i, ".mp4");
    const isVideo = type?.startsWith("video/") || videoExts.has(ext);
    return {
        urls: finalLink,
        filename: `imgur_${id}.${ext}`,
        ...(isVideo ? {} : { isPhoto: true }),
    };
};

const handleSingle = async ({ id }) => {
    if (env.imgurClientId) {
        const apiResult = await handleSingleViaApi(id);
        if (apiResult) return apiResult;
    }

    const probed = await probeId(id);
    if (!probed) return { error: "fetch.empty" };

    const finalExt = normaliseExt(probed.ext);
    return {
        urls: probed.url,
        filename: `imgur_${id}.${finalExt}`,
        ...(videoExts.has(finalExt) ? {} : { isPhoto: true }),
    };
};

const itemFromApiImage = (img) => {
    const ext = normaliseExt(inferExtFromUrl(img.link));
    return {
        type: itemTypeFor(ext),
        url: img.link.replace(/\.gifv$/i, ".mp4"),
        thumb: `https://i.imgur.com/${img.id}m.jpg`,
    };
};

const handleAlbumViaApi = async (albumId, isGallery) => {
    const path = isGallery ? "gallery" : "album";
    const json = await fetchJSON(`${IMGUR_API}/${path}/${albumId}`);
    if (!json?.success) return null;

    const data = json.data;
    const images = data?.images ?? (data?.is_album ? null : [data]);
    if (!images || images.length === 0) return null;

    if (images.length === 1) {
        const img = images[0];
        const ext = normaliseExt(inferExtFromUrl(img.link));
        return {
            urls: img.link.replace(/\.gifv$/i, ".mp4"),
            filename: `imgur_${albumId}.${ext}`,
            ...(videoExts.has(ext) ? {} : { isPhoto: true }),
        };
    }

    return {
        picker: images.map(itemFromApiImage),
        filenameAttributes: { service: "imgur", id: albumId },
    };
};

const handleAlbum = async ({ albumId }) => {
    if (!env.imgurClientId) return { error: "service.token.required" };
    const result = await handleAlbumViaApi(albumId, false);
    if (!result) return { error: "fetch.empty" };
    return result;
};

const handleGallery = async ({ galleryId }) => {
    if (!env.imgurClientId) return { error: "service.token.required" };
    const result = await handleAlbumViaApi(galleryId, true);
    if (!result) {
        // some "gallery" links are actually single-image gallery posts that
        // succeed via the album endpoint
        const fallback = await handleAlbumViaApi(galleryId, false);
        if (fallback) return fallback;
        return { error: "fetch.empty" };
    }
    return result;
};

export default function ({ id, albumId, galleryId, ext }) {
    if (ext && id) return handleDirect({ id, ext });
    if (albumId) return handleAlbum({ albumId });
    if (galleryId) return handleGallery({ galleryId });
    if (id) return handleSingle({ id });
    return { error: "fetch.empty" };
}
