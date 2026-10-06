// Vercel's Node function invokes Express without opening a listening socket.
// Replit continues to use artifacts/api-server/src/index.ts unchanged.
export { default } from "../artifacts/api-server/src/app";
