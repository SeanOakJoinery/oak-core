/**
 * Oak Core v1 — shared auth library for Oak Joinery apps.
 *
 * Sandbox / Option A: load this script after Firebase compat (app + database).
 * Apps own their Firebase SDK load; OakCore assumes window.firebase exists.
 *
 * v2 (2026-09-25): saveUsers() is MERGE-SAFE. It no longer overwrites the
 * whole dispatchBoard/users list from this device's copy. It works out what
 * THIS device changed (added / edited / deleted users, matched by id) since
 * it last heard from the server and applies only that, inside a Firebase
 * transaction — so two people editing users at the same time (or Dispatch
 * saving its board) can't undo each other. Same function names as v1, so
 * apps don't need changing.
 *
 * v3 (2026-09-25): ONE LOGIN for all apps. OakCore.session keeps who is
 * logged in on this device (all apps live on seanoakjoinery.github.io, so
 * they share it). The Oak Joinery home app (/oak-core/) is the only login
 * screen; each app picks up the session, and its "Menu" button goes back
 * home. The session stores the user id + PIN hash, so changing a PIN or
 * deleting a user ends it everywhere. Expires after 12 hours.
 *
 * Usage:
 *   var core = OakCore.createApp({ appId: "boardStock", readOnly: true });
 *   core.init();
 *   core.startUsersSync(onChange);
 */
(function (global) {
  "use strict";

  var VERSION = "3";

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

  function clone(v) {
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }
  function asList(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === "object") return Object.keys(v).map(function (k) { return v[k]; }).filter(function (x) { return x != null; });
    return [];
  }
  // 3-way merge by id: base = last server copy seen, local = what this
  // device wants, remote = server's current copy.
  function mergeUsers(baseIn, localIn, remoteIn) {
    var base = asList(baseIn), local = asList(localIn), remote = asList(remoteIn);
    var baseMap = {}, localMap = {};
    base.forEach(function (u) { if (u && u.id != null) baseMap[u.id] = u; });
    local.forEach(function (u) { if (u && u.id != null) localMap[u.id] = u; });
    function changedHere(id) {
      var l = localMap[id], b = baseMap[id];
      return !!l && (!b || JSON.stringify(l) !== JSON.stringify(b));
    }
    var out = [], seen = {};
    remote.forEach(function (r) {
      if (!r || r.id == null) return;
      seen[r.id] = true;
      if (baseMap[r.id] && !localMap[r.id]) return;          // deleted on this device
      out.push(changedHere(r.id) ? localMap[r.id] : r);       // edited here wins
    });
    local.forEach(function (l) {
      if (!l || l.id == null || seen[l.id]) return;
      if (!baseMap[l.id] || changedHere(l.id)) out.push(l);   // added here / edited here but gone remotely
    });
    return out;
  }


  // ---------------- v3: shared session (one login for every app) ----------------
  var SESSION_KEY = "oakSession";
  var SESSION_HOURS = 12;
  var HOME_URL = "/oak-core/";
  function lsGet(k) { try { return JSON.parse(global.localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) global.localStorage.removeItem(k); else global.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function mainRootOf(list) {
    list = asList(list);
    return list.find(function (u) { return u && u.isMainRoot; }) || list.find(function (u) { return u && u.isRoot; }) || null;
  }
  function listHasApp(list, u, appId) {
    if (!u) return false;
    var mr = mainRootOf(list);
    if (mr && mr.id === u.id) return true;
    if (!u.apps) return true; // legacy account — not yet scoped
    return !!u.apps[appId];
  }
  var session = {
    HOME_URL: HOME_URL,
    get: function () {
      var s = lsGet(SESSION_KEY);
      if (!s || !s.id || !s.exp || Date.now() > s.exp) { if (s) lsSet(SESSION_KEY, null); return null; }
      return s;
    },
    set: function (u) {
      if (!u || !u.id) return;
      lsSet(SESSION_KEY, { id: u.id, pin: u.pin || "", exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
    },
    clear: function () { lsSet(SESSION_KEY, null); },
    // → { status: "ok" | "denied" | "none" | "wait", user }
    resolve: function (users, appId) {
      var s = session.get();
      if (!s) return { status: "none", user: null };
      var list = asList(users);
      if (!list.length) return { status: "wait", user: null }; // team list not loaded yet
      var u = list.find(function (x) { return x && x.id === s.id; });
      if (!u || (u.pin || "") !== (s.pin || "")) { session.clear(); return { status: "none", user: null }; }
      if (appId && !listHasApp(list, u, appId)) return { status: "denied", user: u };
      return { status: "ok", user: u };
    },
    // ?local=1 on an app URL shows that app's own login screen (troubleshooting).
    localLoginAllowed: function () {
      try { return /[?&]local=1\b/.test(global.location.search); } catch (e) { return false; }
    },
    goHome: function (opts) {
      opts = opts || {};
      var q = [];
      if (opts.next) q.push("next=" + encodeURIComponent(opts.next));
      if (opts.denied) q.push("denied=" + encodeURIComponent(opts.denied));
      if (opts.logout) q.push("logout=1");
      global.location.href = HOME_URL + (q.length ? "?" + q.join("&") : "");
    }
  };

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
    var usersBase = null; // deep copy of the last server list (for merge-safe saves)
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
          users = asList(val);
          usersBase = clone(users);
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
      var local = clone(asList(nextUsers));
      var base = usersBase;
      var res = await dispatchBoardRef.child("users").transaction(function (current) {
        if (!current) return local;                 // empty on server: write ours
        if (!base) return mergeUsers([], local, current); // never synced: only add / edit, never delete
        return mergeUsers(base, local, current);
      });
      if (res && res.committed && res.snapshot) {
        users = asList(res.snapshot.val());
        usersBase = clone(users);
      }
      return users.slice();
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
    mergeUsers: mergeUsers,
    session: session,
    userHasAppIn: listHasApp,
    createApp: createApp
  };
})(typeof window !== "undefined" ? window : this);
