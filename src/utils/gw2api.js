import client from "gw2api-client";
import cacheMemory from "gw2api-client/src/cache/memory";

let api = client();
api.cacheStorage(cacheMemory());

export default api;
