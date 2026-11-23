(function () {
  "use strict";

  const platform = window.BrainPlatform;

  function readStudentSession() {
    return platform.identity.readStudentSession();
  }

  function redirectToLogin() {
    window.location.replace("login.html");
  }

  function isGuestStudent(student) {
    return Boolean(student && student.isGuest);
  }

  function getDisplayText(student) {
    const name = student && student.name ? student.name : "同学";
    const studentId = student && student.studentId ? student.studentId : "未登记学号";
    const group = student && student.group ? student.group : "未登记小组";
    return `欢迎，${name} | ${studentId} | ${group}`;
  }

  function renderStudentInfo(student) {
    if (isGuestStudent(student)) {
      const authPill = document.getElementById("authStudentPill");
      if (authPill) authPill.remove();
      return;
    }

    const text = getDisplayText(student);
    const welcomeUser = document.getElementById("welcomeUser");

    if (welcomeUser) {
      welcomeUser.textContent = text;
      return;
    }

    const brandTitle = document.querySelector(".brand-title");
    if (!brandTitle) return;

    let authPill = document.getElementById("authStudentPill");
    if (!authPill) {
      authPill = document.createElement("span");
      authPill.id = "authStudentPill";
      authPill.className = "identity-pill";
      brandTitle.appendChild(authPill);
    }

    authPill.textContent = text;
  }

  function bindLogout() {
    let logoutBtn = document.getElementById("logoutBtn");

    if (!logoutBtn) {
      const topActions = document.querySelector(".top-actions");
      if (!topActions) return;

      logoutBtn = document.createElement("button");
      logoutBtn.id = "logoutBtn";
      logoutBtn.className = "btn secondary";
      logoutBtn.type = "button";
      logoutBtn.textContent = "退出登录";
      topActions.appendChild(logoutBtn);
    }

    if (logoutBtn.dataset.authBound === "true") return;

    logoutBtn.dataset.authBound = "true";
    logoutBtn.addEventListener("click", () => {
      logoutBtn.disabled = true;
      logoutBtn.textContent = "退出中...";
      platform.identity.clearStudentSession();
      window.location.href = "login.html";
    });
  }

  function checkLogin() {
    const student = readStudentSession();

    if (!student) {
      redirectToLogin();
      return null;
    }
    if (!student.isGuest && !student.sessionToken) {
      platform.identity.clearStudentSession();
      redirectToLogin();
      return null;
    }

    renderStudentInfo(student);
    bindLogout();
    return student;
  }

  function getStudentIdentityFields() {
    return platform.identity.getStudentIdentityFields();
  }

  let guestStepDialogOpen = false;
  function confirmGuestNextStep() {
    if (!isGuestStudent(readStudentSession())) return Promise.resolve(true);
    if (guestStepDialogOpen) return Promise.resolve(false);
    guestStepDialogOpen = true;

    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.setAttribute("aria-label", "游客模式提醒");
      dialog.style.cssText = "max-width:min(420px,calc(100vw - 32px));padding:24px;border:1px solid #b88b50;border-radius:12px;color:#241b12;background:#fffaf0;box-shadow:0 20px 60px #0006;font:inherit;line-height:1.7";
      dialog.innerHTML = '<p style="margin:0 0 20px">您现在处于游客模式，实验进度仅保存在当前浏览器，不会上传到后台。是否确认进入下一步？</p><div style="display:flex;justify-content:flex-end;gap:12px"><button type="button" data-answer="no" style="min-width:64px;min-height:44px">否</button><button type="button" data-answer="yes" style="min-width:64px;min-height:44px">是</button></div>';
      function finish(confirmed) {
        dialog.close();
        dialog.remove();
        guestStepDialogOpen = false;
        resolve(confirmed);
      }
      dialog.querySelector('[data-answer="no"]').addEventListener("click", () => finish(false));
      dialog.querySelector('[data-answer="yes"]').addEventListener("click", () => finish(true));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.querySelector('[data-answer="no"]').focus();
    });
  }

  window.checkLogin = checkLogin;
  window.confirmGuestNextStep = confirmGuestNextStep;
  window.getStudentIdentityFields = getStudentIdentityFields;
  window.isGuestSession = function isGuestSession() {
    return isGuestStudent(readStudentSession());
  };
})();
