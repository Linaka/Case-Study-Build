export function createJobQueue({ concurrency = 1 } = {}) {
  const pending = [];
  let active = 0;

  function runNext() {
    while (active < concurrency && pending.length) {
      const item = pending.shift();
      active += 1;

      Promise.resolve()
        .then(item.job)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          runNext();
        });
    }
  }

  return {
    add(job) {
      return new Promise((resolve, reject) => {
        pending.push({ job, resolve, reject });
        runNext();
      });
    },
    stats() {
      return {
        active,
        pending: pending.length,
        concurrency
      };
    }
  };
}
