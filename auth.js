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

  window.checkLogin = checkLogin;
  window.getStudentIdentityFields = getStudentIdentityFields;
  window.isGuestSession = function isGuestSession() {
    return isGuestStudent(readStudentSession());
  };
})();
