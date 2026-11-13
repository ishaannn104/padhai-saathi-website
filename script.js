(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#main-nav");
  const year = document.querySelector("[data-year]");

  if (year) year.textContent = String(new Date().getFullYear());

  const closeMenu = () => {
    if (!menuButton || !nav) return;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    nav.classList.remove("open");
  };

  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    nav?.classList.toggle("open", open);
  });

  nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const revealItems = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("visible"));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.13, rootMargin: "0px 0px -28px 0px" });
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  const timerText = document.querySelector("[data-demo-timer]");
  const startButton = document.querySelector("[data-demo-start]");
  const resetButton = document.querySelector("[data-demo-reset]");
  const timerRing = document.querySelector(".timer-ring");
  const modeLinks = [...document.querySelectorAll("[data-demo-mode]")];
  const focusDemo = document.querySelector("#focus-demo");
  if (!timerText || !startButton || !resetButton || !timerRing || modeLinks.length === 0) return;

  const modeConfigs = {
    pomodoro: {
      label: "Pomodoro", pill: "POMODORO", session: "FOCUS SESSION", caption: "FOCUS TIME",
      seconds: 25 * 60, countUp: false, nextLabel: "UP NEXT", nextTitle: "Take a breather",
      nextTime: "05 min break", status: "Focus session 1 of 4"
    },
    countdown: {
      label: "Countdown", pill: "COUNTDOWN", session: "COUNTDOWN SESSION", caption: "TIME LEFT",
      seconds: 45 * 60, countUp: false, nextLabel: "SESSION PLAN", nextTitle: "Finish your focus block",
      nextTime: "45 min set", status: "Countdown preview · 45 minute target"
    },
    stopwatch: {
      label: "Stopwatch", pill: "STOPWATCH", session: "STOPWATCH SESSION", caption: "TIME ELAPSED",
      seconds: 0, countUp: true, nextLabel: "SESSION PLAN", nextTitle: "Track your study time",
      nextTime: "No fixed end time", status: "Stopwatch preview · count up from zero"
    },
    "deep-work": {
      label: "Deep work", pill: "DEEP WORK", session: "DEEP WORK SESSION", caption: "FOCUS TIME",
      seconds: 90 * 60, countUp: false, nextLabel: "UP NEXT", nextTitle: "Take a longer break",
      nextTime: "15 min break", status: "One protected 90 minute block"
    },
    intervals: {
      label: "Intervals", pill: "INTERVALS", session: "INTERVAL 1 OF 4", caption: "FOCUS TIME",
      seconds: 20 * 60, countUp: false, nextLabel: "UP NEXT", nextTitle: "Short reset",
      nextTime: "05 min break", status: "Round 1 of 4 · 20 min focus"
    },
    custom: {
      label: "Custom cycle", pill: "CUSTOM CYCLE", session: "CUSTOM SESSION", caption: "FOCUS TIME",
      seconds: 30 * 60, countUp: false, nextLabel: "UP NEXT", nextTitle: "Your chosen break",
      nextTime: "05 min break", status: "Example custom cycle · 30 min focus"
    }
  };

  const getElement = (selector) => document.querySelector(selector);
  const modeName = getElement("[data-demo-mode-name]");
  const sessionLabel = getElement("[data-demo-session-label]");
  const timerCaption = getElement("[data-demo-timer-caption]");
  const nextLabel = getElement("[data-demo-next-label]");
  const nextTitle = getElement("[data-demo-next-title]");
  const nextTime = getElement("[data-demo-next-time]");
  const sessionStatus = getElement("[data-demo-session-status]");
  const progressFill = getElement("[data-demo-progress]");

  let activeMode = "pomodoro";
  let config = modeConfigs[activeMode];
  let seconds = config.seconds;
  let intervalId = null;
  let running = false;
  let startedOnce = false;
  let finished = false;
  let endAt = 0;
  let countUpStartedAt = 0;
  let countUpBaseline = 0;

  const formatTime = (value) => {
    const safe = Math.max(0, Math.floor(value));
    const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
    const remainder = (safe % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  };

  const updateControl = () => {
    const label = running ? "Pause preview" : finished ? "Restart preview" : startedOnce ? "Resume preview" : "Start preview";
    const icon = running ? "Ⅱ" : finished ? "↺" : "▶";
    startButton.innerHTML = `<span aria-hidden="true">${icon}</span> ${label}`;
    startButton.setAttribute("aria-label", `${running ? "Pause" : finished ? "Restart" : startedOnce ? "Resume" : "Start"} the ${config.label.toLowerCase()} preview`);
  };

  const render = () => {
    timerText.textContent = formatTime(seconds);
    timerText.setAttribute("aria-label", config.countUp
      ? `${Math.floor(seconds / 60)} minutes and ${seconds % 60} seconds elapsed`
      : `${Math.floor(seconds / 60)} minutes and ${seconds % 60} seconds remaining`);
    const progress = config.countUp || config.seconds === 0 ? 0 : Math.max(0, Math.min(100, ((config.seconds - seconds) / config.seconds) * 100));
    timerRing.style.setProperty("--demo-progress", `${progress}%`);
    if (progressFill) progressFill.style.width = `${progress}%`;
    updateControl();
  };

  const stopClock = () => {
    if (intervalId !== null) window.clearInterval(intervalId);
    intervalId = null;
    running = false;
  };

  const resetPreview = () => {
    stopClock();
    startedOnce = false;
    finished = false;
    seconds = config.seconds;
    endAt = 0;
    countUpStartedAt = 0;
    countUpBaseline = 0;
    if (sessionStatus) sessionStatus.textContent = config.status;
    render();
  };

  const tick = () => {
    if (config.countUp) {
      seconds = countUpBaseline + Math.floor((Date.now() - countUpStartedAt) / 1000);
      render();
      return;
    }
    seconds = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (seconds === 0) {
      stopClock();
      finished = true;
      if (sessionStatus) sessionStatus.textContent = "Preview complete · choose a mode to run it again";
    }
    render();
  };

  const startPreview = () => {
    if (running) {
      if (config.countUp) countUpBaseline = seconds;
      stopClock();
      render();
      return;
    }
    if (finished) resetPreview();
    running = true;
    startedOnce = true;
    finished = false;
    if (config.countUp) {
      countUpBaseline = seconds;
      countUpStartedAt = Date.now();
    } else {
      endAt = Date.now() + seconds * 1000;
    }
    intervalId = window.setInterval(tick, 250);
    render();
  };

  const selectMode = (link) => {
    const nextMode = link.dataset.demoMode;
    if (!Object.hasOwn(modeConfigs, nextMode)) return;
    stopClock();
    activeMode = nextMode;
    config = modeConfigs[activeMode];
    startedOnce = false;
    finished = false;
    seconds = config.seconds;
    endAt = 0;
    countUpStartedAt = 0;
    countUpBaseline = 0;
    modeLinks.forEach((item) => {
      const selected = item === link;
      item.classList.toggle("is-selected", selected);
      if (selected) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
    if (modeName) modeName.textContent = config.pill;
    if (sessionLabel) sessionLabel.textContent = config.session;
    if (timerCaption) timerCaption.textContent = config.caption;
    if (nextLabel) nextLabel.textContent = config.nextLabel;
    if (nextTitle) nextTitle.textContent = config.nextTitle;
    if (nextTime) nextTime.textContent = config.nextTime;
    if (sessionStatus) sessionStatus.textContent = config.status;
    render();
  };

  startButton.addEventListener("click", startPreview);
  resetButton.addEventListener("click", resetPreview);
  modeLinks.forEach((link) => link.addEventListener("click", () => selectMode(link)));
  render();
})();

