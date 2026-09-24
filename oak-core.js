/**
 * Oak Core v1 — shared auth library for Oak Joinery apps.
 *
 * Sandbox / Option A: load this script after Firebase compat (app + database).
 * Apps own their Firebase SDK load; OakCore assumes window.firebase exists.
 *
 * Live apps currently .set() the whole users array on dispatchBoard/users.
 * Core v1 keeps that behaviour when readOnly is false.
 * Merge-safe writes come later (do not change live apps from this sandbox).
 *
 * Usage:
 *   var core = OakCore.createApp({ appId: "boardStock", readOnly: true });
 *   core.init();
 *   core.startUsersSync(onChange);
 */
(function (global) {
  "use strict";

  var VERSION = "1";

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyCkoUkLIlxdxD2AAEpLGW4dzqkSeC5lVh0",
    authDomain: "oak-joinery-stock-dispatch.firebaseapp.com",
    databaseURL: "https://oak-joinery-stock-dispatch-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "oak-joinery-stock-dispatch",
    storageBucket: "oak-joinery-stock-dispatch.firebasestorage.app",
    messagingSenderId: "538461584463",
    appId: "1:538461584463:web:b84319c125e9bf9a47be3a"
  };

  var APP_LABELS = {
    dispatch: "Dispatch",
    stock: "Stock List",
    boardStock: "Board Stock",
    consumables: "Consumables"
  };

  function defaultApps() {
    return { dispatch: true, stock: true, boardStock: true, consumables: true };
  }

  async function hashPin(pin) {
    var enc = new TextEncoder().encode(String(pin == null ? "" : pin));
    var buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /**
   * Create an auth controller for one app / sandbox instance.
   * @param {{ appId: string, readOnly?: boolean }} options
   *   readOnly defaults to true for the sandbox demo.
   */
  function createApp(options) {
    options = options || {};
    var appId = options.appId;
    if (!appId) throw new Error("OakCore.createApp: appId is required");
    var readOnly = options.readOnly !== false; // default true

    var fbApp = null;
    var dispatchBoardRef = null;
    var users = [];
    var usersListener = null;
    var onUsersChange = null;

    function getMainRoot() {
      return (
        users.find(function (u) {
          return u && u.isMainRoot;
        }) ||
        users.find(function (u) {
          return u && u.isRoot;
        }) ||
        null
      );
    }

    function isMainRoot(u) {
      var mr = getMainRoot();
      return !!(u && mr && u.id === mr.id);
    }

    function userHasApp(u, checkAppId) {
      checkAppId = checkAppId || appId;
      if (!u) return false;
      if (isMainRoot(u)) return true;
      if (!u.apps) return true; // legacy account — not yet scoped
      return !!u.apps[checkAppId];
    }

    function can(user, perm) {
      if (!user) return false;
      if (user.isRoot) return true;
      return !!(user.permissions && user.permissions[perm]);
    }

    function getUsers() {
      return users.slice();
    }

    function getUsersForApp(checkAppId) {
      checkAppId = checkAppId || appId;
      return users.filter(function (u) {
        return userHasApp(u, checkAppId);
      });
    }

    function init() {
      if (typeof firebase === "undefined") {
        throw new Error("OakCore.init: window.firebase is missing — load Firebase compat first");
      }

      var apps = firebase.apps || [];
      if (apps.length === 0) {
        fbApp = firebase.initializeApp(FIREBASE_CONFIG);
      } else {
        try {
          fbApp = firebase.app("oak-core");
        } catch (e) {
          fbApp = firebase.initializeApp(FIREBASE_CONFIG, "oak-core");
        }
      }

      dispatchBoardRef = firebase.database(fbApp).ref("dispatchBoard");
      return this;
    }

    function startUsersSync(onChange) {
      if (!dispatchBoardRef) {
        throw new Error("OakCore.startUsersSync: call init() first");
      }
      onUsersChange = typeof onChange === "function" ? onChange : null;
      stopUsersSync();
      usersListener = dispatchBoardRef.child("users").on(
        "value",
        function (snap) {
          var val = snap.val();
          users = Array.isArray(val) ? val : [];
          if (onUsersChange) onUsersChange(getUsers());
        },
        function (err) {
          console.warn("OakCore users sync error:", err && err.message ? err.message : err);
        }
      );
      return this;
    }

    function stopUsersSync() {
      if (dispatchBoardRef && usersListener != null) {
        dispatchBoardRef.child("users").off("value", usersListener);
        usersListener = null;
      }
    }

    async function verifyPin(user, pin) {
      if (!user) return false;
      var hashed = await hashPin(pin);
      return hashed === user.pin;
    }

    /**
     * Login locally — compares PIN hash only. Does NOT write to Firebase.
     * @returns {object} the user object
     */
    async function login(userId, pin) {
      var user = users.find(function (u) {
        return u && u.id === userId;
      });
      if (!user) throw new Error("User not found");
      if (!userHasApp(user)) {
        throw new Error("This user does not have access to " + (APP_LABELS[appId] || appId));
      }
      var ok = await verifyPin(user, pin);
      if (!ok) throw new Error("Incorrect PIN");
      return user;
    }

    /**
     * Save the full users array.
     * Live apps currently .set() the whole users array; core v1 keeps that
     * behaviour when not readOnly. Merge-safe writes come later.
     * Sandbox (readOnly) always throws — never touches live data.
     */
    async function saveUsers(nextUsers) {
      if (readOnly) {
        throw new Error("Sandbox is read-only");
      }
      if (!dispatchBoardRef) {
        throw new Error("OakCore.saveUsers: call init() first");
      }
      // Same as live apps: whole-array .set() on dispatchBoard/users.
      // Merge-safe / per-user writes are planned for a later core version.
      await dispatchBoardRef.child("users").set(nextUsers);
      users = Array.isArray(nextUsers) ? nextUsers.slice() : [];
      return users;
    }

    return {
      appId: appId,
      readOnly: readOnly,
      init: init,
      startUsersSync: startUsersSync,
      stopUsersSync: stopUsersSync,
      getUsers: getUsers,
      getUsersForApp: getUsersForApp,
      userHasApp: userHasApp,
      isMainRoot: isMainRoot,
      getMainRoot: getMainRoot,
      can: can,
      verifyPin: verifyPin,
      login: login,
      saveUsers: saveUsers,
      getDispatchBoardRef: function () {
        return dispatchBoardRef;
      }
    };
  }

  global.OakCore = {
    VERSION: VERSION,
    FIREBASE_CONFIG: FIREBASE_CONFIG,
    APP_LABELS: APP_LABELS,
    defaultApps: defaultApps,
    hashPin: hashPin,
    uid: uid,
    esc: esc,
    createApp: createApp
  };
})(typeof window !== "undefined" ? window : this);
