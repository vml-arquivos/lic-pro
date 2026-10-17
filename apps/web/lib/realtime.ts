export type RealtimeConnection = {
  send: (payload: string) => void;
  close: () => void;
};

export function connectRealtime(
  url: string,
  onMessage: (message: string) => void,
): RealtimeConnection {
  let socket: WebSocket | undefined;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempt = 0;
    };
    socket.onmessage = (event) => onMessage(String(event.data));
    socket.onclose = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      attempt += 1;
      timer = setTimeout(connect, delay);
    };
  };

  connect();
  return {
    send: (payload) => socket?.send(payload),
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}
