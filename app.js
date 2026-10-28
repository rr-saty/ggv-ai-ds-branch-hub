(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const config = window.BRANCH_HUB_CONFIG || {};
  const keyConfigured = Boolean(config.SUPABASE_ANON_KEY && !config.SUPABASE_ANON_KEY.includes("PASTE_") && !config.SUPABASE_ANON_KEY.includes("YOUR_"));
  const urlConfigured = Boolean(config.SUPABASE_URL && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.SUPABASE_URL));
  const configured = urlConfigured && keyConfigured && window.supabase;
  const db = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  window.branchSupabase = db;
  const text = (v) => String(v ?? "");
  const esc = (v) => text(v).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const dateLabel = (v, options) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.valueOf()) ? d.toLocaleDateString(undefined, options || {day:"2-digit", month:"short"}):"Date to be confirmed"; };
  const timeLabel = (v) => { const d = new Date(v); return Number.isNaN(d.valueOf()) ? "Time TBC" : d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); };
  const prettyError = (e) => e?.message || "Could not load content. Please try again later.";
  function setEmpty(id, message) { const el = document.getElementById(id); if (el) el.innerHTML = '<div class="empty-state">' + esc(message) + '</div>'; }
  function setStat(id, n) { const el = document.getElementById(id); if(el) el.textContent = String(n).padStart(2,"0"); }
  function renderNotices(rows) {
    const el = $("#noticeList");
    if (!rows.length) return setEmpty("noticeList", "No published notices yet.");
    el.innerHTML = rows.map(n => {
      const category = ["academic","event","urgent","general"].includes(n.category) ? n.category : "general";
      const tag = category === "general" ? "NOTICE" : category.toUpperCase();
      return '<article class="notice-item"><div class="notice-type ' + esc(category) + '">' + (category==="event"?"✳":category==="academic"?"▤":"◉") + '</div><div><h4>' + esc(n.title) + '</h4><p>' + esc(n.body) + '</p><span class="meta">' + esc(dateLabel(n.created_at, {day:"numeric",month:"short",year:"numeric"})) + '</span></div><span class="notice-tag">' + esc(tag) + '</span></article>';
    }).join("");
  }
  function expandRecurringSchedules(rows, now) {
    const horizon = new Date(now.getTime() + 42 * 86400000);
    const occurrences = [];
    rows.forEach((s) => {
      const start = new Date(s.starts_at);
      const end = new Date(s.ends_at);
      if (!s.recurrence_rule || !s.recurrence_rule.includes("FREQ=WEEKLY")) {
        if (end >= new Date(now.getTime() - 86400000)) occurrences.push(s);
        return;
      }
      const dayMatch = s.recurrence_rule.match(/BYDAY=([A-Z,]+)/);
      const days = (dayMatch ? dayMatch[1].split(",") : []).map(day => ({MO:1,TU:2,WE:3,TH:4,FR:5,SA:6,SU:0}[day])).filter(day => day !== undefined);
      if (!days.length) { if (end >= new Date(now.getTime() - 86400000)) occurrences.push(s); return; }
      const duration = end.getTime() - start.getTime();
      const cursor = new Date(Math.max(start.getTime(), now.getTime() - 86400000));
      cursor.setHours(0,0,0,0);
      while (cursor <= horizon) {
        if (cursor >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && days.includes(cursor.getDay())) {
          const occurrenceStart = new Date(cursor);
          occurrenceStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
          if (occurrenceStart >= new Date(now.getTime() - 86400000)) {
            occurrences.push({...s, starts_at: occurrenceStart.toISOString(), ends_at: new Date(occurrenceStart.getTime() + duration).toISOString()});
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return occurrences.sort((a,b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0,8);
  }
  function renderSchedule(rows) {
    $("#todayLabel").textContent = new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}).toUpperCase();
    const el=$("#scheduleList");
    if (!rows.length) return setEmpty("scheduleList","No upcoming schedule entries. Connect the approved Google Calendar sync or add entries as staff.");
    el.innerHTML=rows.map((s,i)=>'<div class="schedule-item"><div class="schedule-time">' + esc(timeLabel(s.starts_at)) + '<br><span>' + esc(timeLabel(s.ends_at)) + '</span></div><div class="schedule-bar ' + ["","blue","green","orange"][i%4] + '"></div><div class="schedule-info"><strong>' + esc(s.title) + '</strong><small>' + esc([s.course_code,s.faculty_name,s.room].filter(Boolean).join(" · ") || "Details to be confirmed") + '</small></div></div>').join("");
  }
  function renderDeadlines(rows) {
    const el=$("#deadlineList");
    if(!rows.length) return setEmpty("deadlineList","No upcoming deadlines published.");
    el.innerHTML=rows.map(d=>'<div class="deadline-item"><div class="date-tile"><strong>' + esc(dateLabel(d.due_at,{day:"2-digit"})) + '</strong><small>' + esc(dateLabel(d.due_at,{month:"short"}).toUpperCase()) + '</small></div><div><h4>' + esc(d.title) + '</h4><p>' + esc(d.description || "See the course instructions for details.") + '</p></div><span class="deadline-status">' + esc(d.status || "Upcoming") + '</span></div>').join("");
  }
  function safeHref(url) {
    try { const u=new URL(url,window.location.href); return ["https:","http:"].includes(u.protocol) ? u.href : "#"; } catch { return "#"; }
  }
  function renderResources(rows) {
    const el=$("#resourceList");
    if(!rows.length) return setEmpty("resourceList","No resources published yet.");
    el.innerHTML=rows.map((r,i)=>'<a class="resource-item" href="' + esc(safeHref(r.url)) + '" ' + (safeHref(r.url)==="#"?'aria-disabled="true"':'target="_blank" rel="noopener noreferrer"') + '><div class="resource-symbol ' + ["","blue","green","orange"][i%4] + '">' + ["⌘","▤","▧","⌁"][i%4] + '</div><div><h4>' + esc(r.title) + '</h4><p>' + esc(r.description || r.category || "Learning resource") + '</p></div><span class="resource-link">↗</span></a>').join("");
  }
  function renderEvents(rows) {
    const el=$("#eventList");
    if(!rows.length) return setEmpty("eventList","No upcoming events published.");
    el.innerHTML=rows.map(e=>'<article class="event-card"><div class="event-date"><strong>' + esc(dateLabel(e.starts_at,{day:"2-digit"})) + '</strong><small>' + esc(dateLabel(e.starts_at,{month:"short"}).toUpperCase()) + '</small></div><div><h4>' + esc(e.title) + '</h4><p>' + esc(e.description || e.location || "Check the event details with branch faculty.") + (e.location ? " · " + esc(e.location) : "") + '</p>' + (e.registration_url ? '<a class="meta" href="' + esc(safeHref(e.registration_url)) + '" target="_blank" rel="noopener noreferrer">Registration details ↗</a>' : '') + '</div></article>').join("");
  }
  function renderData(data) {
    renderNotices(data.notices); renderSchedule(expandRecurringSchedules(data.schedules, now)); renderDeadlines(data.deadlines); renderResources(data.resources); renderEvents(data.events);
    setStat("noticeStat",data.notices.length); setStat("deadlineStat",data.deadlines.length); setStat("resourceStat",data.resources.length); setStat("eventStat",data.events.length);
  }
  async function loadPublicData() {
    if (!db) {
      $("#dataStatus").textContent = "Supabase key not configured";
      ["noticeList","scheduleList","deadlineList","resourceList","eventList"].forEach(id=>setEmpty(id,"Connect the Supabase publishable/anon key in config.js to load live branch content."));
      ["noticeStat","deadlineStat","resourceStat","eventStat"].forEach(id=>setStat(id,0));
      return;
    }
    $("#dataStatus").textContent = "Syncing published content…";
    const now=new Date();
    const jobs=await Promise.all([
      db.from("notices").select("id,title,body,category,created_at,publish_at,status").eq("status","published").or("publish_at.is.null,publish_at.lte."+now.toISOString()).order("created_at",{ascending:false}).limit(8),
      db.from("schedules").select("id,title,course_code,faculty_name,room,starts_at,ends_at,recurrence_rule").gte("ends_at",new Date(now.getTime()-86400000).toISOString()).order("starts_at").limit(8),
      db.from("deadlines").select("id,title,description,due_at,status").eq("status","upcoming").order("due_at").limit(8),
      db.from("resources").select("id,title,description,url,category").eq("status","published").order("created_at",{ascending:false}).limit(8),
      db.from("events").select("id,title,description,starts_at,ends_at,location,registration_url").eq("status","published").gte("starts_at",now.toISOString()).order("starts_at").limit(6)
    ]);
    const errors=jobs.filter(x=>x.error);
    const names=["notices","schedules","deadlines","resources","events"];
    const data={};
    jobs.forEach((result,i)=>data[names[i]]=result.error?[]:(result.data||[]));
    renderData(data);
    $("#dataStatus").textContent=errors.length ? "Some data unavailable — check database policies" : "Live database · " + new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  }
  window.refreshBranchContent=loadPublicData;
  loadPublicData();

  const sidebar=$("#sidebar");
  $("#menuToggle")?.addEventListener("click",()=>sidebar.classList.toggle("open"));
  document.querySelectorAll(".nav-item").forEach(link=>link.addEventListener("click",()=>{
    document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("active"));
    link.classList.add("active"); sidebar.classList.remove("open");
  }));

  $("#automationForm")?.addEventListener("submit",async (event)=>{
    event.preventDefault();
    const form=event.currentTarget, status=$("#formStatus"), button=form.querySelector('button[type="submit"]');
    const apiBase=(config.API_BASE_URL||"").replace(/\/$/,"");
    if(!apiBase){status.className="form-note error";status.textContent="Automation is not connected yet. A staff-approved Vercel endpoint and authenticated n8n workflow must be configured first.";return;}
    const payload=Object.fromEntries(new FormData(form).entries());
    if(payload.title.trim().length<3||payload.details.trim().length<3){status.className="form-note error";status.textContent="Enter a title and details for staff review.";return;}
    button.disabled=true; status.className="form-note"; status.textContent="Submitting request…";
    try {
      const response=await fetch(apiBase+"/api/automation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"The review endpoint rejected this request.");
      status.className="form-note success";status.textContent=result.message||"Request received. This is not an official publication.";
      form.reset();
    } catch(error) {status.className="form-note error";status.textContent=prettyError(error);}
    finally {button.disabled=false;}
  });
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadPublicData();});
})();