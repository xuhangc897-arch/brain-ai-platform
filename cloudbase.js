/*
 * CloudBase 统一初始化与真实登录模块
 * ------------------------------------------------------------
 * 本文件直接使用腾讯云 CloudBase Web SDK V3 的 Auth API 和数据库 API。
 * 它不会模拟登录，也不会在本地伪造用户；登录结果完全来自 CloudBase Auth。
 */
(function () {
  "use strict";

  /*
   * CloudBase 环境 ID。
   * 后续更换环境时，只需要改这里，页面脚本无需分散修改。
   */
  const ENV_ID = "memory-detective-platform-d369a42";

  /*
   * CloudBase SDK 由页面中的 cloudbase.full.js 提供。
   * 如果 SDK 没有加载成功，直接抛错，避免页面继续执行“假登录”逻辑。
   */
  if (!window.cloudbase || typeof window.cloudbase.init !== "function") {
    throw new Error("CloudBase SDK 未加载，请确认已先引入 cloudbase.full.js。");
  }

  /*
   * 初始化 CloudBase 应用实例。
   * region 不传时默认上海地域；这里显式写出，便于和腾讯云环境保持一致。
   */
  const app = window.cloudbase.init({
    env: ENV_ID,
    region: "ap-shanghai"
  });

  /*
   * V3 SDK 中 Auth 模块挂在 app.auth 上，数据库通过 app.database() 获取。
   */
  const auth = typeof app.auth === "function" ? app.auth() : app.auth;
  const db = app.database();
  const studentsCollection = db.collection("students");

  /*
   * 从 CloudBase 返回的用户对象中提取稳定 uid。
   * V3 文档中的用户 ID 字段是 user.id；这里保留 user_id/uid 作为兼容兜底。
   */
  function getUserUid(user) {
    return user && (user.id || user.user_id || user.uid);
  }

  /*
   * 从 CloudBase 用户对象中提取页面展示用用户名。
   * 优先显示真实用户名，其次兼容邮箱、手机号、昵称，最后回退到 uid。
   */
  function getUserDisplayName(user, fallbackUsername) {
    if (!user) return fallbackUsername || "同学";

    return (
      user.username ||
      user.email ||
      user.phone ||
      user.user_metadata?.username ||
      user.user_metadata?.name ||
      user.user_metadata?.nickName ||
      fallbackUsername ||
      getUserUid(user) ||
      "同学"
    );
  }

  /*
   * 把 CloudBase Auth 返回值统一成“有 error 就抛错”的形式。
   * V3 SDK 常见返回格式为 { data, error }，这能让页面逻辑更清楚。
   */
  function assertCloudBaseResult(result, fallbackMessage) {
    if (result && result.error) {
      throw new Error(result.error.message || fallbackMessage);
    }

    return result && "data" in result ? result.data : result;
  }

  /*
   * 兼容不同 CloudBase Web SDK 版本的用户名密码登录方法。
   * 新版文档中是 signInWithPassword，当前 CDN 3.0.0 中常见方法名是 signIn。
   */
  async function signInByPassword(username, password) {
    if (typeof auth.signInWithPassword === "function") {
      return await auth.signInWithPassword({ username, password });
    }

    if (typeof auth.signIn === "function") {
      return await auth.signIn({ username, password });
    }

    throw new Error("当前 CloudBase SDK 不支持用户名密码登录。");
  }

  /*
   * 兼容不同 SDK 版本的用户名密码注册方法。
   * 该方法只给教师初始化工具使用，学生登录页不会调用它。
   */
  async function createUserWithPassword(username, password) {
    if (typeof auth.signUp === "function") {
      return assertCloudBaseResult(
        await auth.signUp({ username, password }),
        "创建 CloudBase Auth 账号失败。"
      );
    }

    if (typeof auth.signUpWithPassword === "function") {
      return assertCloudBaseResult(
        await auth.signUpWithPassword({ username, password }),
        "创建 CloudBase Auth 账号失败。"
      );
    }

    throw new Error("当前 CloudBase SDK 不支持创建用户名密码账号。");
  }

  function normalizeUserFromAuthData(data) {
    return data?.user || data?.session?.user || data || null;
  }

  /*
   * 教师管理模式下，students 资料必须由 admin/initStudents.html 统一导入。
   * 学生登录时只读取资料，不再自动创建，避免把登录页变成隐式注册入口。
   */
  async function getStudentRecordByUid(uid) {
    const existingResult = await studentsCollection
      .where({ uid })
      .limit(1)
      .get();

    if (existingResult.code) {
      throw new Error(existingResult.message || "查询 students 集合失败。");
    }

    const existingStudents = Array.isArray(existingResult.data) ? existingResult.data : [];
    return existingStudents[0] || null;
  }

  async function requireStudentRecord(user, username) {
    const uid = getUserUid(user);

    if (!uid) {
      throw new Error("CloudBase 已登录，但未能获取当前用户 uid。");
    }

    const student = await getStudentRecordByUid(uid);

    if (!student) {
      throw new Error("未找到学生资料，请先由教师完成学生账号初始化。");
    }

    return {
      uid,
      username: student.name || student.studentId || getUserDisplayName(user, username),
      student
    };
  }

  /*
   * 真实用户名密码登录。
   * 这里调用 CloudBase Auth 的 signInWithPassword，不做任何模拟或本地绕过。
   */
  async function login(username, password) {
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");

    if (!normalizedUsername || !normalizedPassword) {
      throw new Error("请输入用户名和密码。");
    }

    let data;

    try {
      data = assertCloudBaseResult(
        await signInByPassword(normalizedUsername, normalizedPassword),
        "用户名或密码错误。"
      );
    } catch (error) {
      throw new Error("用户名或密码错误。");
    }

    try {
      const user = data?.user || (await getCurrentUser());
      const student = await requireStudentRecord(user, normalizedUsername);

      return {
        uid: student.uid,
        username: student.username,
        user,
        student: student.student,
        session: data?.session || null
      };
    } catch (error) {
      await logout().catch(() => {});
      throw new Error(error.message || "未找到学生资料，请联系教师。");
    }
  }

  /*
   * 退出登录。
   * 直接调用 CloudBase Auth signOut，清除真实会话和本地登录态。
   */
  async function logout() {
    assertCloudBaseResult(await auth.signOut(), "退出登录失败。");
  }

  /*
   * 获取 CloudBase 当前用户。
   * 返回 null 表示当前没有有效登录用户。
   */
  async function getCurrentUser() {
    if (typeof auth.getUser === "function") {
      const data = assertCloudBaseResult(await auth.getUser(), "获取当前用户失败。");
      return normalizeUserFromAuthData(data);
    }

    if (typeof auth.getLoginState === "function") {
      const data = assertCloudBaseResult(await auth.getLoginState(), "获取当前用户失败。");
      return normalizeUserFromAuthData(data);
    }

    throw new Error("当前 CloudBase SDK 不支持获取当前用户。");
  }

  /*
   * 检查登录态。
   * 返回统一对象：{ isLoggedIn, uid, username, user, session }。
   */
  async function checkLogin() {
    let session = null;
    let user = null;

    if (typeof auth.getSession === "function") {
      const data = assertCloudBaseResult(await auth.getSession(), "检查登录状态失败。");
      session = data?.session || data || null;
      user = session?.user || (session ? await getCurrentUser() : null);
    } else if (typeof auth.getLoginState === "function") {
      const data = assertCloudBaseResult(await auth.getLoginState(), "检查登录状态失败。");
      session = data || null;
      user = normalizeUserFromAuthData(data);
    } else {
      throw new Error("当前 CloudBase SDK 不支持检查登录状态。");
    }

    if (!session || !user) {
      return {
        isLoggedIn: false,
        uid: "",
        username: "",
        user: null,
        student: null,
        session: null
      };
    }

    const uid = getUserUid(user) || "";
    const student = uid ? await getStudentRecordByUid(uid).catch(() => null) : null;

    if (!student) {
      return {
        isLoggedIn: false,
        uid: "",
        username: "",
        user: null,
        student: null,
        session: null
      };
    }

    return {
      isLoggedIn: true,
      uid,
      username: student.name || student.studentId || getUserDisplayName(user),
      user,
      student,
      session
    };
  }

  /*
   * 首页登录保护。
   * 未登录时跳转到 login.html；已登录时把用户信息返回给首页显示欢迎语。
   */
  async function requireLogin() {
    const loginState = await checkLogin();

    if (!loginState.isLoggedIn) {
      window.location.replace("login.html");
      return null;
    }

    return loginState;
  }

  /*
   * 暴露给页面使用的统一接口。
   * login/logout/getCurrentUser/checkLogin 是第二阶段正式接口；
   * loginWithAccount/getLoginState/requireLogin 作为已有页面兼容别名保留。
   */
  window.BrainCloudBase = {
    ENV_ID,
    app,
    auth,
    db,
    login,
    logout,
    getCurrentUser,
    checkLogin,
    createUserWithPassword,
    loginWithAccount: login,
    getLoginState: checkLogin,
    requireLogin
  };
})();
