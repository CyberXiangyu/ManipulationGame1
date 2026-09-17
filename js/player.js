/* Video player with transport controls and playback-coverage tracking.

   Coverage is what enforces "watch the whole clip before answering": the
   timeline is divided into one-second buckets and a bucket is only marked once
   it has actually been played through. Seeking past a region therefore leaves
   it uncovered, so skipping to the end does not unlock the form. */
window.REVIEW_PLAYER = (function () {
  "use strict";

  const cfg = window.REVIEW_CONFIG;

  function create(elements, handlers) {
    const video = elements.video;
    const state = {
      pairId: null,
      buckets: [],      // 0/1 per second of the timeline
      duration: 0,
      lastTime: 0,
      rate: cfg.defaultPlaybackRate || 1,
    };

    function bucketCount() {
      return Math.max(1, Math.ceil(state.duration || 0));
    }

    function coveredFraction() {
      if (!state.buckets.length) return 0;
      let n = 0;
      for (let i = 0; i < state.buckets.length; i += 1) n += state.buckets[i] ? 1 : 0;
      return n / state.buckets.length;
    }

    function isComplete() {
      return coveredFraction() >= (cfg.requiredWatchFraction || 1) - 1e-9;
    }

    function markRange(fromSec, toSec) {
      if (!state.buckets.length) return;
      const lo = Math.max(0, Math.floor(Math.min(fromSec, toSec)));
      const hi = Math.min(state.buckets.length - 1, Math.floor(Math.max(fromSec, toSec)));
      for (let i = lo; i <= hi; i += 1) state.buckets[i] = 1;
    }

    function emit() {
      if (handlers.onProgress) {
        handlers.onProgress({
          pairId: state.pairId,
          fraction: coveredFraction(),
          complete: isComplete(),
          buckets: state.buckets.slice(),
        });
      }
    }

    function formatTime(seconds) {
      if (!isFinite(seconds) || seconds < 0) seconds = 0;
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return m + ":" + String(s).padStart(2, "0");
    }

    function renderTransport() {
      const playing = !video.paused && !video.ended;
      elements.playPause.textContent = playing ? "Pause" : "Play";
      elements.playPause.setAttribute("aria-label", playing ? "Pause video" : "Play video");
      elements.playPause.classList.toggle("is-playing", playing);
      elements.time.textContent =
        formatTime(video.currentTime) + " / " + formatTime(state.duration);
      const pct = state.duration ? (video.currentTime / state.duration) * 100 : 0;
      elements.seek.value = String(pct);
      elements.seekFill.style.width = pct + "%";
      renderCoverageBar();
    }

    function renderCoverageBar() {
      const bar = elements.coverage;
      if (!bar) return;
      if (bar.childElementCount !== state.buckets.length) {
        bar.textContent = "";
        for (let i = 0; i < state.buckets.length; i += 1) {
          const cell = document.createElement("span");
          cell.className = "coverage-cell";
          bar.appendChild(cell);
        }
      }
      for (let i = 0; i < state.buckets.length; i += 1) {
        bar.children[i].classList.toggle("is-covered", !!state.buckets[i]);
      }
    }

    /* --- transport -------------------------------------------------- */

    function togglePlay() {
      if (video.paused || video.ended) {
        video.play().catch((err) => console.warn("playback blocked", err));
      } else {
        video.pause();
      }
    }

    function replay() {
      video.currentTime = 0;
      state.lastTime = 0;
      video.play().catch((err) => console.warn("playback blocked", err));
    }

    function setRate(rate) {
      state.rate = rate;
      video.playbackRate = rate;
      Array.prototype.forEach.call(elements.rates.children, (btn) => {
        btn.classList.toggle("is-active", Number(btn.dataset.rate) === rate);
        btn.setAttribute("aria-pressed", String(Number(btn.dataset.rate) === rate));
      });
    }

    function nudge(deltaSeconds) {
      video.currentTime = Math.min(state.duration,
                                   Math.max(0, video.currentTime + deltaSeconds));
    }

    /* --- wiring ----------------------------------------------------- */

    elements.playPause.addEventListener("click", togglePlay);
    elements.replay.addEventListener("click", replay);
    video.addEventListener("click", togglePlay);

    (cfg.playbackRates || [1]).forEach((rate) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rate-btn";
      btn.dataset.rate = String(rate);
      btn.textContent = rate + "×";
      btn.addEventListener("click", () => setRate(rate));
      elements.rates.appendChild(btn);
    });

    elements.seek.addEventListener("input", () => {
      if (!state.duration) return;
      const target = (Number(elements.seek.value) / 100) * state.duration;
      video.currentTime = target;
      state.lastTime = target;
    });

    video.addEventListener("loadedmetadata", () => {
      state.duration = video.duration || state.duration || 0;
      const want = bucketCount();
      if (state.buckets.length !== want) {
        const next = new Array(want).fill(0);
        for (let i = 0; i < Math.min(want, state.buckets.length); i += 1) {
          next[i] = state.buckets[i];
        }
        state.buckets = next;
      }
      video.playbackRate = state.rate;
      renderTransport();
      emit();
    });

    video.addEventListener("timeupdate", () => {
      const t = video.currentTime;
      /* Only credit forward movement no larger than a normal frame step, so a
         seek does not silently fill in everything it jumped over. */
      const delta = t - state.lastTime;
      if (delta > 0 && delta < 1.5) {
        markRange(state.lastTime, t);
        emit();
      }
      state.lastTime = t;
      renderTransport();
    });

    video.addEventListener("ended", () => {
      if (state.buckets.length) {
        markRange(state.duration - 1.001, state.duration);
      }
      state.lastTime = video.duration || state.duration;
      renderTransport();
      emit();
    });

    ["play", "pause", "seeked", "ratechange"].forEach((evt) => {
      video.addEventListener(evt, renderTransport);
    });

    video.addEventListener("error", () => {
      if (handlers.onError) handlers.onError(video.error);
    });

    /* --- public ----------------------------------------------------- */

    function load(pairId, src, savedBuckets, knownDuration) {
      state.pairId = pairId;
      state.duration = knownDuration || 0;
      state.lastTime = 0;
      state.buckets = Array.isArray(savedBuckets) && savedBuckets.length
        ? savedBuckets.slice()
        : new Array(bucketCount()).fill(0);
      video.pause();
      video.removeAttribute("src");
      video.src = src;
      video.load();
      setRate(state.rate);
      renderTransport();
      emit();
    }

    function markAllCovered() {
      for (let i = 0; i < state.buckets.length; i += 1) state.buckets[i] = 1;
      renderCoverageBar();
      emit();
    }

    return {
      load,
      togglePlay,
      replay,
      setRate,
      nudge,
      markAllCovered,
      getBuckets: () => state.buckets.slice(),
      getFraction: coveredFraction,
      isComplete,
      pause: () => video.pause(),
    };
  }

  return { create };
})();
