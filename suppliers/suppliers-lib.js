/* Oak Joinery — shared supplier list (2026-09-30).
   The Suppliers app is the one place suppliers are added, edited and removed.
   Master list: suppliers/list/<id>. Each supplier is copied ("mirrored") into
   boardStock/suppliers and/or consumablesStock/suppliers for the apps ticked, so
   Board Stock, Consumables, Stock In and the weekly reorder email keep working
   exactly as before. Orders also uses this to add a new supplier off a quote. */
(function(){
  "use strict";
  var FIELDS = ["name","contact","title","tel","cell","fax","email","cc","address","website","notes","cardUrl","sendDirect"];
  var APPS = [
    { key:"board", label:"Board Stock", path:"boardStock/suppliers" },
    { key:"consumables", label:"Consumables", path:"consumablesStock/suppliers" }
  ];
  function low(s){ return String(s || "").trim().toLowerCase(); }
  function keyFor(name){ return (low(name).replace(/[.#$\[\]\/]/g, "_").replace(/\s+/g, " ").slice(0, 100)) || ("s" + Date.now().toString(36)); }
  function uid(){ return "sup" + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function list(v){ return v && typeof v === "object" ? Object.keys(v).map(function(k){ var x = v[k]; if(x && typeof x === "object"){ x = Object.assign({}, x); x.id = k; return x; } return null; }).filter(Boolean) : []; }
  function findByName(master, name){ var n = low(name); if(!n) return null; return list(master).find(function(s){ return low(s.name) === n; }) || null; }
  // The copy each app keeps (the field names those apps already use).
  function mirrorRec(id, s){
    return { name:s.name || "", contactPerson:s.contact || "", email:s.email || "", ccEmail:s.cc || "",
      tel:s.tel || "", cell:s.cell || "", fax:s.fax || "", address:s.address || "", sendDirect:!!s.sendDirect, masterId:id };
  }
  // ctx = { board: boardStock/suppliers, consumables: consumablesStock/suppliers }
  // Returns the multi-path update that writes the supplier and its app copies.
  function saveUpdates(id, s, ctx){
    var u = {}, links = Object.assign({}, s.links || {});
    APPS.forEach(function(a){
      var appList = (ctx && ctx[a.key]) || {};
      var sid = links[a.key] && appList[links[a.key]] ? links[a.key] : null;
      if(!sid) sid = Object.keys(appList).find(function(k){ var x = appList[k]; return x && (x.masterId === id || low(x.name) === low(s.name)); }) || null;
      if(s.apps && s.apps[a.key]){
        if(!sid) sid = uid();
        var m = mirrorRec(id, s);
        Object.keys(m).forEach(function(f){ u[a.path + "/" + sid + "/" + f] = m[f]; });
        links[a.key] = sid;
      } else {
        if(sid) u[a.path + "/" + sid] = null;   // unticked: take it off that app's list
        delete links[a.key];
      }
    });
    FIELDS.forEach(function(f){ u["suppliers/list/" + id + "/" + f] = (s[f] === undefined || s[f] === "") ? null : s[f]; });
    ["apps","needsDetails","addedFrom","created","createdBy","updatedBy","updatedAt"].forEach(function(f){ if(s[f] !== undefined) u["suppliers/list/" + id + "/" + f] = s[f]; });
    u["suppliers/list/" + id + "/links"] = Object.keys(links).length ? links : null;
    return u;
  }
  // Supplier copies an app has that aren't in the master list yet (bring them in once).
  function importUpdates(master, ctx, book, who){
    var m = {}; list(master).forEach(function(s){ m[s.id] = s; });
    var byName = function(n){ var k = Object.keys(m).find(function(id){ return low(m[id].name) === low(n); }); return k || null; };
    var changed = {};
    APPS.forEach(function(a){
      var appList = (ctx && ctx[a.key]) || {};
      Object.keys(appList).forEach(function(sid){
        var x = appList[sid]; if(!x || !x.name) return;
        var id = (x.masterId && m[x.masterId]) ? x.masterId : byName(x.name);
        if(!id){ id = keyFor(x.name); while(m[id] && low(m[id].name) !== low(x.name)) id += "_"; m[id] = { name:String(x.name).trim(), apps:{}, links:{}, created:new Date().toISOString(), createdBy:who || "", addedFrom:"imported" }; changed[id] = 1; }
        var s = m[id]; s.apps = s.apps || {}; s.links = s.links || {};
        if(!s.apps[a.key] || s.links[a.key] !== sid && !appList[s.links[a.key]]){ s.apps[a.key] = true; s.links[a.key] = sid; changed[id] = 1; }
        [["contact","contactPerson"],["email","email"],["cc","ccEmail"],["tel","tel"],["cell","cell"],["fax","fax"],["address","address"]].forEach(function(p){ if(!s[p[0]] && x[p[1]]){ s[p[0]] = x[p[1]]; changed[id] = 1; } });
        if(a.key === "board" && x.sendDirect && !s.sendDirect){ s.sendDirect = true; changed[id] = 1; }
      });
    });
    // the Orders supplier book (address, phone numbers from POs / business cards)
    Object.keys(book || {}).forEach(function(k){
      var b = book[k]; if(!b || !b.name) return;
      var id = byName(b.name);
      if(!id){ id = keyFor(b.name); while(m[id]) id += "_"; m[id] = { name:String(b.name).trim(), apps:{}, links:{}, created:new Date().toISOString(), createdBy:who || "", addedFrom:"Orders" }; changed[id] = 1; }
      ["contact","title","tel","cell","fax","email","cc","address","website","notes","cardUrl"].forEach(function(f){ if(!m[id][f] && b[f]){ m[id][f] = b[f]; changed[id] = 1; } });
    });
    var u = {}, links = {};
    Object.keys(changed).forEach(function(id){ var s = m[id]; delete s.id;
      var su = saveUpdates(id, s, ctx);
      // don't rewrite the app copies on import — only link them
      Object.keys(su).forEach(function(p){ if(p.indexOf("suppliers/list/") === 0) u[p] = su[p]; });
      APPS.forEach(function(a){ if(s.links && s.links[a.key]) links[a.path + "/" + s.links[a.key] + "/masterId"] = id; });
    });
    Object.assign(u, links);
    return { updates:u, count:Object.keys(changed).length };
  }
  function deleteUpdates(id, s, ctx){
    var u = {}; u["suppliers/list/" + id] = null;
    APPS.forEach(function(a){ var appList = (ctx && ctx[a.key]) || {};
      Object.keys(appList).forEach(function(k){ var x = appList[k]; if(x && (x.masterId === id || k === (s.links || {})[a.key] || low(x.name) === low(s.name))) u[a.path + "/" + k] = null; }); });
    return u;
  }
  function hasDetails(s){ return !!(s && (s.tel || s.cell) && s.address); }
  window.OakSuppliers = { FIELDS:FIELDS, APPS:APPS, keyFor:keyFor, list:list, findByName:findByName, saveUpdates:saveUpdates, deleteUpdates:deleteUpdates, importUpdates:importUpdates, hasDetails:hasDetails, low:low };
})();
