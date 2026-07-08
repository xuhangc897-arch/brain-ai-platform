(function () {
  "use strict";

  const SESSION_KEY = "studentSession";

  function readStudentSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (event) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function redirectToLogin() {
    window.location.replace("login.html");
  }

  function isGuestStudent(student) {
    return Boolean(student && student.isGuest);
  }

  function getDisplayText(student) {
    if (isGuestStudent(student)) {
      return "游客模式 | 实验记录仅保存在本地，不会上传后台";
    }

    const name = student && student.name ? student.name : "同学";
    const studentId = student && student.studentId ? student.studentId : "未登记学号";
    const group = student && student.group ? student.group : "未登记小组";
    return `欢迎，${name} | ${studentId} | ${group}`;
  }

  function renderStudentInfo(student) {
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
      localStorage.removeItem(SESSION_KEY);
      window.location.href = "login.html";
    });
  }

  function checkLogin() {
    const student = readStudentSession();

    if (!student) {
      redirectToLogin();
      return null;
    }

    renderStudentInfo(student);
    bindLogout();
    return student;
  }

  function getStudentIdentityFields() {
    const student = readStudentSession() || {};

    if (isGuestStudent(student)) {
      return {
        studentId: "guest",
        studentName: "游客",
        className: "游客模式",
        groupName: "本地体验",
        isGuest: true,
        createdAt: new Date().toLocaleString()
      };
    }

    return {
      studentId: student.studentId || "",
      studentName: student.name || "",
      className: student.class || "",
      groupName: student.group || "",
      createdAt: new Date().toLocaleString()
    };
  }

  window.checkLogin = checkLogin;
  window.getStudentIdentityFields = getStudentIdentityFields;
  window.isGuestSession = function isGuestSession() {
    return isGuestStudent(readStudentSession());
  };
})();
