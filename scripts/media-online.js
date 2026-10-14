// Online videos: YouTube and Vimeo videos that stay on their service. The
// markup is described in scripts/media-player.js, which loads this module
// only on pages that hold one and hands it the shared player parts.
//
// Before the tap nothing contacts the service: the visitor sees the still
// copied into the site and the site's play button. The tap loads the
// service's player (youtube-nocookie.com or player.vimeo.com) and its player
// API, hides the service's own bar and lays the site's bar over the picture.
// Whenever the service has to speak for itself (the API cannot load, the
// video cannot be shown here, a phone refuses to start it from the site's
// button), the service's own player takes over, so the video still plays.

const SERVICES = {
  youtube: { name: "YouTube", api: "https://www.youtube.com/iframe_api" },
  vimeo: { name: "Vimeo", api: "https://player.vimeo.com/api/player.js" },
};

/** "90", "90s", "1m30s", "1h2m3s" → seconds; anything else → 0. */
function seconds(value) {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(String(value ?? "").trim());
  if (!match) return 0;
  const [, h = 0, m = 0, s = 0] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** A YouTube or Vimeo address → { service, id, hash, start } (hash: a Vimeo
    unlisted video's key; start: seconds), or null for anything else. */
export function onlineVideo(address) {
  let url;
  try {
    url = new URL(String(address).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start") ?? /(?:^|&)t=([^&]+)/.exec(url.hash.slice(1))?.[1]);

  const youtube = (id) => (/^[\w-]{11}$/.test(id ?? "") ? { service: "youtube", id, hash: "", start } : null);
  if (host === "youtu.be") return youtube(parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v"));
    if (["embed", "shorts", "live", "v"].includes(parts[0])) return youtube(parts[1]);
    return null;
  }

  const vimeo = (id, hash) =>
    /^\d+$/.test(id ?? "") ? { service: "vimeo", id, hash: /^[\da-f]+$/i.test(hash ?? "") ? hash : "", start } : null;
  if (host === "player.vimeo.com") return parts[0] === "video" ? vimeo(parts[1], url.searchParams.get("h")) : null;
  if (host === "vimeo.com") {
    // vimeo.com/ID, /ID/HASH, /channels/…/ID, /groups/…/videos/ID, /showcase/…/video/ID
    if (/^\d+$/.test(parts[0] ?? "")) return vimeo(parts[0], parts[1] ?? url.searchParams.get("h"));
    return vimeo(parts.findLast((part) => /^\d+$/.test(part)), url.searchParams.get("h"));
  }
  return null;
}

/** The address of the service's player for a video: hiding the service's
    bar and taking commands when the site's bar drives it (own), with the
    service's bar otherwise. Starts playing as it loads. */
export function playerAddress(video, own, origin = location.origin) {
  if (video.service === "youtube") {
    const query = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0", iv_load_policy: "3" });
    if (own) {
      query.set("controls", "0");
      query.set("disablekb", "1");
      query.set("enablejsapi", "1");
      if (origin && origin !== "null") query.set("origin", origin);
    }
    if (video.start) query.set("start", String(video.start));
    return `https://www.youtube-nocookie.com/embed/${video.id}?${query}`;
  }
  const query = new URLSearchParams({ autoplay: "1", playsinline: "1", dnt: "1", title: "0", byline: "0", portrait: "0" });
  if (video.hash) query.set("h", video.hash);
  if (own) query.set("controls", "0");
  return `https://player.vimeo.com/video/${video.id}?${query}${video.start ? `#t=${video.start}s` : ""}`;
}

// The service's player API script, loaded once, on the first tap.
const apis = {};
function loadApi(service) {
  apis[service] ??= new Promise((resolve, reject) => {
    const ready = () => (service === "youtube" ? window.YT?.Player : window.Vimeo?.Player);
    if (service === "youtube" && window.YT?.loaded) return resolve(window.YT);
    if (service === "youtube") {
      const before = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof before === "function") before();
        resolve(window.YT);
      };
    }
    const script = document.createElement("script");
    script.src = SERVICES[service].api;
    script.async = true;
    script.onload = () => {
      if (service === "vimeo") ready() ? resolve(window.Vimeo) : reject(new Error("no Vimeo player"));
    };
    script.onerror = () => {
      apis[service] = null; // a later tap may try again
      reject(new Error(`${SERVICES[service].name} player API could not load`));
    };
    document.head.append(script);
  });
  return apis[service];
}

// The service's player, shaped like a <video> for the site's bar. The
// service reports its state through update(); the bar's changes go to it
// through control.
class ServicePlayer extends EventTarget {
  paused = true;
  duration = NaN;
  canChangeSpeed = true;
  control = null;
  closed = false; // after a hand-over the service speaks for itself
  #time = 0;
  #muted = false;
  #mutedSetAt = -Infinity;
  #rate = 1;

  get currentTime() {
    return this.#time;
  }

  set currentTime(time) {
    this.#time = Math.max(0, Math.min(Number(time) || 0, this.duration || Infinity));
    this.control?.seek(this.#time);
    this.emit("timeupdate");
  }

  get muted() {
    return this.#muted;
  }

  set muted(muted) {
    this.#muted = Boolean(muted);
    this.#mutedSetAt = Date.now();
    this.control?.mute(this.#muted);
    this.emit("volumechange");
  }

  get playbackRate() {
    return this.#rate;
  }

  // The bar shows the speed the service confirms, not the one asked for.
  set playbackRate(rate) {
    if (!this.control) return;
    Promise.resolve(this.control.rate(rate)).then(
      (confirmed) => this.update({ rate: confirmed }),
      () => {
        // Vimeo refuses speed changes on some owners' videos.
        this.canChangeSpeed = false;
        this.emit("ratechange");
      },
    );
  }

  play() {
    if (!this.closed) this.control?.play();
  }

  pause() {
    if (!this.closed) this.control?.pause();
  }

  emit(type) {
    if (!this.closed) this.dispatchEvent(new Event(type));
  }

  close() {
    this.closed = true;
    this.control = null;
  }

  /** What the service reports; only changes become events. */
  update({ time, duration, paused, muted, rate }) {
    if (this.closed) return;
    if (Number.isFinite(duration) && duration > 0 && duration !== this.duration) {
      this.duration = duration;
      this.emit("durationchange");
    }
    if (Number.isFinite(time) && time !== this.#time) {
      this.#time = time;
      this.emit("timeupdate");
    }
    // The service's own report lags a change made here; trust ours briefly.
    if (typeof muted === "boolean" && muted !== this.#muted && Date.now() - this.#mutedSetAt > 1000) {
      this.#muted = muted;
      this.emit("volumechange");
    }
    if (Number.isFinite(rate) && rate !== this.#rate) {
      this.#rate = rate;
      this.emit("ratechange");
    }
    if (typeof paused === "boolean" && paused !== this.paused) {
      this.paused = paused;
      this.emit(paused ? "pause" : "play");
    }
  }
}

// YouTube's IFrame API on the frame made here. YouTube sends no time
// events, so the time is read four times a second while it plays.
function connectYouTube(YT, frame, player) {
  return new Promise((resolve, reject) => {
    let timer = 0;
    let ready = false;
    let rateWaiter = null;
    const read = () => {
      if (player.closed) return clearInterval(timer);
      player.update({ time: api.getCurrentTime(), duration: api.getDuration(), muted: api.isMuted() });
    };
    // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
    const state = (data) => {
      clearInterval(timer);
      if (player.closed) return;
      if (data === 1 || data === 3) timer = setInterval(read, 250);
      read();
      if (data === 1) player.update({ paused: false });
      else if (data !== 3) player.update({ paused: true });
      if (data === 0) player.emit("ended");
    };
    // YouTube answers a speed change with an event, or not at all when the
    // video cannot take that speed; then its current speed is the answer.
    const rate = (wanted) =>
      new Promise((answer) => {
        const timeout = setTimeout(() => answer(api.getPlaybackRate()), 1000);
        rateWaiter = (confirmed) => {
          clearTimeout(timeout);
          answer(confirmed);
        };
        api.setPlaybackRate(wanted);
      });
    const api = new YT.Player(frame, {
      events: {
        onReady: () => {
          if (player.closed) return;
          player.control = {
            play: () => api.playVideo(),
            pause: () => api.pauseVideo(),
            seek: (time) => api.seekTo(time, true),
            mute: (muted) => (muted ? api.mute() : api.unMute()),
            rate,
          };
          player.canChangeSpeed = (api.getAvailablePlaybackRates?.() ?? [1, 2]).length > 1;
          player.update({ duration: api.getDuration(), muted: api.isMuted(), rate: api.getPlaybackRate() });
          // It may have started before the API was listening.
          state(api.getPlayerState());
          ready = true;
          resolve({ cc: null });
        },
        onStateChange: ({ data }) => state(data),
        onPlaybackRateChange: ({ data }) => {
          rateWaiter?.(data);
          rateWaiter = null;
          player.update({ rate: data });
        },
        onError: () => {
          clearInterval(timer);
          player.emit("error");
          if (!ready) reject(new Error("YouTube cannot play this video here"));
        },
      },
    });
  });
}

// Vimeo's Player API on the frame made here. Its own captions drive CC.
async function connectVimeo(Vimeo, frame, player) {
  const api = new Vimeo.Player(frame);
  const quiet = (promise) => promise?.catch?.(() => {});
  player.control = {
    play: () => quiet(api.play()),
    pause: () => quiet(api.pause()),
    seek: (time) => quiet(api.setCurrentTime(time)),
    mute: (muted) => quiet(api.setMuted(muted)),
    rate: (rate) => api.setPlaybackRate(rate),
  };
  api.on("play", () => player.update({ paused: false }));
  api.on("pause", () => player.update({ paused: true }));
  api.on("ended", () => {
    player.update({ paused: true });
    player.emit("ended");
  });
  api.on("timeupdate", ({ seconds: time, duration }) => player.update({ time, duration }));
  api.on("durationchange", ({ duration }) => player.update({ duration }));
  api.on("volumechange", () => quiet(api.getMuted().then((muted) => player.update({ muted }))));
  api.on("playbackratechange", ({ playbackRate }) => player.update({ rate: playbackRate }));
  // Errors from a single call carry its method and are handled there.
  api.on("error", (error) => {
    if (!error?.method) player.emit("error");
  });

  await api.ready();
  // It may have started before the listeners above were attached.
  const [duration, muted, tracks, paused, time, rate] = await Promise.all([
    api.getDuration().catch(() => NaN),
    api.getMuted().catch(() => false),
    api.getTextTracks().catch(() => []),
    api.getPaused().catch(() => true),
    api.getCurrentTime().catch(() => 0),
    api.getPlaybackRate().catch(() => 1),
  ]);
  player.update({ duration, muted, time, rate, paused });
  if (!tracks.length) return { cc: null };
  let on = tracks.some((track) => track.mode === "showing");
  const first = tracks.find((track) => track.kind === "subtitles" || track.kind === "captions") ?? tracks[0];
  return {
    cc: {
      isOn: () => on,
      toggle: () => quiet(on ? api.disableTextTrack() : api.enableTextTrack(first.language, first.kind)),
      watch: (callback) =>
        api.on("texttrackchange", ({ language }) => {
          on = Boolean(language);
          callback();
        }),
    },
  };
}

const done = new WeakSet();

function setUp(link, video, kit) {
  const service = SERVICES[video.service];
  const own = link.dataset.controls !== "service";
  const still = link.querySelector("img");
  const name = kit.nameOf(link) || still?.alt.trim() || "";
  const box = kit.wrap(link, "online");
  if (link.id) box.id = link.id; // links to #the-video keep working
  box.dataset.service = video.service;
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", name ? `Video: ${name}` : "Video");
  const start = kit.startButton(name);
  start.setAttribute("aria-label", `${start.getAttribute("aria-label")} (plays from ${service.name})`);
  if (still) link.replaceWith(still);
  else link.remove();
  box.append(start);

  let player = null;
  let frame = null;
  let bar = null;

  // The service's own player takes over: its bar, its messages.
  const handOver = (address) => {
    player?.close();
    box.dataset.state = "service";
    start.hidden = true;
    bar?.remove();
    frame.removeAttribute("tabindex");
    frame.removeAttribute("aria-hidden");
    if (address && frame.src !== address) frame.src = address;
  };

  const begin = async () => {
    box.dataset.state = "loading";
    start.setAttribute("aria-busy", "true");
    frame = document.createElement("iframe");
    frame.className = "media-frame";
    frame.src = playerAddress(video, own);
    frame.title = name ? `${name} (${service.name})` : `${service.name} video`;
    frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
    // YouTube refuses embeds that send no referrer.
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    start.before(frame);
    if (!own) {
      handOver();
      return;
    }
    // The site's bar is the way to control it; the frame is only the picture.
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    const surface = document.createElement("div");
    surface.className = "media-surface";
    start.before(surface);

    player = new ServicePlayer();
    // With the service's own controls back, its message and buttons work.
    const serviceAddress = playerAddress(video, false);
    player.addEventListener("error", () => handOver(serviceAddress));
    let parts;
    let deadline = 0;
    try {
      // Never stays loading: after 10 s the service's own player takes over.
      parts = await Promise.race([
        loadApi(video.service).then((lib) =>
          (video.service === "youtube" ? connectYouTube : connectVimeo)(lib, frame, player)),
        new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error("the player did not answer")), 10000);
        }),
      ]);
    } catch {
      // An error already handed over; otherwise the API did not load or answer.
      if (box.dataset.state !== "service") handOver(serviceAddress);
      return;
    } finally {
      clearTimeout(deadline);
    }
    if (box.dataset.state === "service") return; // an error came first
    bar = kit.videoBar(box, player, { start, surface, cc: parts.cc });
    start.removeAttribute("aria-busy");
    box.dataset.state = "ready";
    // At the end the still comes back, covering the service's suggestions.
    player.addEventListener("ended", () => {
      delete box.dataset.started;
      start.hidden = false;
      bar.hidden = true;
    });
    // The bar started listening after the service did: catch up.
    if (!player.paused) player.emit("play");
    else player.play();
    // A phone may refuse to start the service from the site's button; then
    // the visitor taps the service's own play button instead.
    setTimeout(() => {
      if (!("started" in box.dataset) && box.dataset.state === "ready") {
        box.dataset.state = "tap";
        start.hidden = true;
        frame.removeAttribute("tabindex");
        frame.removeAttribute("aria-hidden");
      }
    }, 4000);
    player.addEventListener("play", () => {
      if (box.dataset.state !== "tap") return;
      box.dataset.state = "ready";
      // Started from the service's own button by keyboard: focus comes to the bar.
      if (document.activeElement === frame) bar.querySelector(".media-toggle").focus();
      frame.tabIndex = -1;
      frame.setAttribute("aria-hidden", "true");
    });
  };

  start.addEventListener("click", () => {
    if (!frame) begin();
    else kit.play(player);
  });
}

/** Turns each a.online-video under root into a still with the site's play
    button that loads the service on tap. kit: the player's shared parts. */
export function enhanceOnline(root, kit) {
  for (const link of root.querySelectorAll("a.online-video")) {
    if (done.has(link) || link.closest(".media-player")) continue;
    const video = onlineVideo(link.href);
    if (!video) continue; // not YouTube or Vimeo: it stays a link
    done.add(link);
    setUp(link, video, kit);
  }
}
