declare module 'ws' {
  const WebSocket: typeof globalThis.WebSocket;
  export { WebSocket };
  export default WebSocket;
}
