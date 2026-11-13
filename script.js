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

  const initStudyPlanner = () => {
    const form = document.querySelector("#study-planner-form");
    const taskList = document.querySelector("[data-plan-list]");
    const taskTemplate = document.querySelector("#planner-task-template");
    const emptyMessage = document.querySelector("[data-plan-empty]");
    if (!form || !taskList || !taskTemplate || !emptyMessage) return;

    const titleInput = document.querySelector("#planner-task");
    const subjectInput = document.querySelector("#planner-subject");
    const minutesInput = document.querySelector("#planner-minutes");
    const message = document.querySelector("[data-plan-message]");
    const clearButton = document.querySelector("[data-plan-clear]");
    const exportButton = document.querySelector("[data-plan-export]");
    const filters = [...document.querySelectorAll("[data-plan-filter]")];
    const storageKey = "padhai-saathi-web-plan-v1";
    let tasks = [];
    let activeFilter = "all";

    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(stored)) {
        tasks = stored.slice(0, 80).map((item, index) => {
          const title = typeof item?.title === "string" ? item.title.trim().slice(0, 100) : "";
          const subject = typeof item?.subject === "string" ? item.subject.trim().slice(0, 48) : "";
          const minutes = Number.parseInt(item?.minutes, 10);
          return {
            id: typeof item?.id === "string" ? item.id.slice(0, 100) : `saved-${index}`,
            title,
            subject,
            minutes: Number.isFinite(minutes) ? Math.min(480, Math.max(1, minutes)) : 25,
            done: item?.done === true
          };
        }).filter((item) => item.title.length > 0);
      }
    } catch {
      tasks = [];
    }

    const setMessage = (text) => {
      if (message) message.textContent = text;
    };

    const saveTasks = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(tasks));
        return true;
      } catch {
        return false;
      }
    };

    const renderTasks = () => {
      const completed = tasks.filter((task) => task.done).length;
      const remaining = tasks.filter((task) => !task.done);
      const remainingMinutes = remaining.reduce((sum, task) => sum + task.minutes, 0);
      const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
      const remainingNode = document.querySelector("[data-plan-remaining]");
      const minutesNode = document.querySelector("[data-plan-minutes]");
      const completedNode = document.querySelector("[data-plan-complete]");
      const totalNode = document.querySelector("[data-plan-total]");
      const progress = document.querySelector(".planner-progress");
      const progressFill = document.querySelector("[data-plan-progress]");

      if (remainingNode) remainingNode.textContent = String(remaining.length);
      if (minutesNode) minutesNode.textContent = String(remainingMinutes);
      if (completedNode) completedNode.textContent = String(percent);
      if (totalNode) totalNode.textContent = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
      if (progress) progress.setAttribute("aria-valuenow", String(percent));
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (clearButton) clearButton.disabled = completed === 0;
      if (exportButton) exportButton.disabled = tasks.length === 0;

      const visibleTasks = tasks.filter((task) => activeFilter === "all"
        || (activeFilter === "open" && !task.done)
        || (activeFilter === "done" && task.done));
      taskList.replaceChildren();
      visibleTasks.forEach((task) => {
        const item = taskTemplate.content.firstElementChild.cloneNode(true);
        item.classList.toggle("is-done", task.done);
        item.dataset.taskId = task.id;
        item.querySelector("[data-task-title]").textContent = task.title;
        const subject = item.querySelector("[data-task-subject]");
        subject.textContent = task.subject || "No subject";
        subject.hidden = !task.subject;
        item.querySelector("[data-task-minutes]").textContent = String(task.minutes);

        const toggle = item.querySelector("[data-task-toggle]");
        toggle.setAttribute("aria-pressed", String(task.done));
        toggle.setAttribute("aria-label", task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} complete`);
        toggle.addEventListener("click", () => {
          task.done = !task.done;
          const saved = saveTasks();
          renderTasks();
          setMessage(saved ? (task.done ? "Nice work—task complete." : "Task moved back to your list.") : "Couldn't save in this browser. Your plan is still open for now.");
        });

        const remove = item.querySelector("[data-task-delete]");
        remove.setAttribute("aria-label", `Delete ${task.title}`);
        remove.addEventListener("click", () => {
          tasks = tasks.filter((candidate) => candidate.id !== task.id);
          const saved = saveTasks();
          renderTasks();
          setMessage(saved ? "Task removed from your plan." : "Couldn't save in this browser. Your plan is still open for now.");
        });
        taskList.append(item);
      });

      emptyMessage.hidden = visibleTasks.length > 0;
      if (visibleTasks.length === 0) {
        emptyMessage.textContent = tasks.length === 0
          ? "No tasks yet. Add one small step to get started."
          : activeFilter === "open" ? "All caught up—there are no tasks left to do."
            : activeFilter === "done" ? "Completed tasks will show here."
              : "Nothing matches this filter.";
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();
      const subject = subjectInput.value.trim();
      const minutes = Number.parseInt(minutesInput.value, 10);
      if (!title || !Number.isFinite(minutes) || minutes < 1 || minutes > 480 || tasks.length >= 80) {
        if (tasks.length >= 80) setMessage("This plan has reached 80 tasks. Remove one before adding another.");
        else setMessage("Add a task and choose a time from 1 to 480 minutes.");
        return;
      }

      const id = window.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      tasks.push({ id, title, subject, minutes, done: false });
      const saved = saveTasks();
      activeFilter = "all";
      filters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.planFilter === activeFilter)));
      renderTasks();
      setMessage(saved ? "Task added and saved in this browser." : "Task added for now, but this browser couldn't save it.");
      form.reset();
      minutesInput.value = "25";
      titleInput.focus();
    });

    filters.forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.planFilter;
      filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      renderTasks();
    }));

    clearButton?.addEventListener("click", () => {
      const before = tasks.length;
      tasks = tasks.filter((task) => !task.done);
      if (tasks.length === before) return;
      const saved = saveTasks();
      renderTasks();
      setMessage(saved ? "Completed tasks cleared." : "Couldn't save in this browser. Your plan is still open for now.");
    });

    exportButton?.addEventListener("click", () => {
      if (tasks.length === 0) return;
      const stamp = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date());
      const lines = tasks.map((task) => `- [${task.done ? "x" : " "}] ${task.title}${task.subject ? ` · ${task.subject}` : ""} · ${task.minutes} min`);
      const text = [`Padhai Saathi study plan · ${stamp}`, "", ...lines, "", `${tasks.filter((task) => task.done).length} of ${tasks.length} tasks complete.`].join("\n");
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "padhai-saathi-study-plan.txt";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Your plan was exported as a text file.");
    });

    renderTasks();
    setMessage(tasks.length ? "Your plan is saved in this browser." : "Add a task to start your plan.");
  };

  initStudyPlanner();

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
