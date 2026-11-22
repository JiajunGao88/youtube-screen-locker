function createClock() {
  let nowMs = 0;
  let seq = 1;
  const timers = [];
  const api = {
    now() {
      return nowMs;
    },
    schedule(fn, ms) {
      const id = seq++;
      timers.push({ id, fn, at: nowMs + ms });
      return id;
    },
    clear(id) {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    advance(ms) {
      const target = nowMs + ms;
      while (true) {
        const due = timers
          .filter((timer) => timer.at <= target)
          .sort((a, b) => a.at - b.at || a.id - b.id);
        if (!due.length) break;
        nowMs = due[0].at;
        const item = due[0];
        api.clear(item.id);
        item.fn();
      }
      nowMs = target;
    },
    pending() {
      return timers.length;
    }
  };
  return api;
}

module.exports = { createClock };
