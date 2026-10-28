(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const db = window.branchSupabase;
  const status = $("authStatus");
  const modal = $("loginPanel");
  const adminPanel = $("adminPanel");
  const reviewPanel = $("reviewPanel");
  const loginButton = $("loginOpen");
  const loginForm = $("loginForm");
  const modalStatus = $("authStatusModal");
  const setStatus = value => { if(status) status.textContent=value; };
  const openModal = () => { modal.hidden=false; $("loginEmail")?.focus(); };
  const closeModal = () => { modal.hidden=true; if(modalStatus)modalStatus.textContent=""; };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const dateLabel = value => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.valueOf()) ? d.toLocaleString([], {dateStyle:"medium",timeStyle:"short"}) : "Date not provided"; };
  loginButton?.addEventListener("click",openModal);
  $("loginClose")?.addEventListener("click",closeModal);
  modal?.addEventListener("click",e=>{if(e.target===modal)closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

  async function loadPendingRequests() {
    const list=$("reviewRequestList");
    if(!db || !list)return;
    list.innerHTML='<div class="empty-state">Loading requests…</div>';
    try {
      const {data,error}=await db.from("branch_update_requests")
        .select("id,request_type,title,details,audience,requested_date,submitted_at,status")
        .eq("status","pending_review").order("submitted_at",{ascending:false}).limit(30);
      if(error)throw error;
      if(!data?.length){list.innerHTML='<div class="empty-state">No requests awaiting review.</div>';return;}
      list.innerHTML=data.map(item=>{
        const noteId="review-note-"+esc(item.id);
        return '<article class="review-request" data-request-id="'+esc(item.id)+'">'+
          '<div class="review-request-head"><h4>'+esc(item.title)+'</h4><span class="review-kind">'+esc(item.request_type.toUpperCase())+'</span></div>'+
          '<p>'+esc(item.details)+'</p>'+
          '<div class="review-request-meta">Audience: '+esc(item.audience)+' · Date: '+esc(dateLabel(item.requested_date))+'<br>Submitted: '+esc(dateLabel(item.submitted_at))+'</div>'+
          '<label for="'+noteId+'" class="review-note-label">Review note (optional)</label><textarea class="review-note" id="'+noteId+'" rows="2" maxlength="1000" placeholder="Reason for rejection or staff note…"></textarea>'+
          '<div class="review-actions"><button type="button" class="button primary" data-review-decision="approved" data-request-id="'+esc(item.id)+'">Approve & publish</button><button type="button" class="button reject" data-review-decision="rejected" data-request-id="'+esc(item.id)+'">Reject</button></div>'+
          '</article>';
      }).join("");
    } catch(error) {
      list.innerHTML='<div class="empty-state">Could not load review queue: '+esc(error.message||"Check the migration and staff permissions.")+'</div>';
    }
  }

  async function refreshAuth() {
    if(!db) {
      setStatus("Supabase not configured");
      if(loginButton)loginButton.classList.remove("hidden");
      if(adminPanel)adminPanel.hidden=true;
      if(reviewPanel)reviewPanel.hidden=true;
      return;
    }
    try {
      const {data:{session},error:sessionError}=await db.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session) {
        if(loginButton)loginButton.classList.remove("hidden");
        if(adminPanel)adminPanel.hidden=true;
        if(reviewPanel)reviewPanel.hidden=true;
        setStatus("Staff sign in");
        return;
      }
      const {data:profile,error}=await db.from("profiles").select("display_name,role").eq("id",session.user.id).maybeSingle();
      if(error)throw error;
      const role=profile?.role || "student";
      const staff=["faculty","admin"].includes(role);
      if(loginButton)loginButton.classList.toggle("hidden",true);
      if(adminPanel)adminPanel.hidden=!staff;
      if(reviewPanel)reviewPanel.hidden=!staff;
      setStatus((profile?.display_name || session.user.email || "Signed in")+" · "+role);
      if(staff) await loadPendingRequests();
      if(window.refreshBranchContent) await window.refreshBranchContent();
    } catch(error) {
      setStatus("Auth setup needed");
      if(adminPanel)adminPanel.hidden=true;
      if(reviewPanel)reviewPanel.hidden=true;
      if(modalStatus)modalStatus.textContent="Could not load profile: "+(error.message||"Check the Supabase migration and account setup.");
    }
  }

  loginForm?.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!db){modalStatus.textContent="Add the Supabase publishable/anon key in config.js and apply the database migration first.";return;}
    const email=$("loginEmail").value.trim();
    const password=$("loginPassword").value;
    const button=loginForm.querySelector('button[type="submit"]');
    button.disabled=true;modalStatus.textContent="Signing in…";
    try {
      const {error}=await db.auth.signInWithPassword({email,password});
      if(error)throw error;
      closeModal();await refreshAuth();
    } catch(error) { modalStatus.textContent=error.message||"Sign-in failed."; }
    finally {button.disabled=false;}
  });

  $("signOut")?.addEventListener("click",async()=>{
    if(!db)return;
    const {error}=await db.auth.signOut();
    if(error){setStatus(error.message);return;}
    await refreshAuth();
  });

  $("refreshRequests")?.addEventListener("click",loadPendingRequests);
  $("reviewRequestList")?.addEventListener("click",async e=>{
    const button=e.target.closest("[data-review-decision]");
    if(!button||!db)return;
    const decision=button.dataset.reviewDecision;
    const requestId=button.dataset.requestId;
    const card=button.closest(".review-request");
    const note=card?.querySelector(".review-note")?.value.trim() || "";
    if(decision==="approved" && !window.confirm("Approve this request and publish it to the branch hub?"))return;
    if(decision==="rejected" && !window.confirm("Reject this request? It will not be published."))return;
    card?.querySelectorAll("button").forEach(b=>b.disabled=true);
    const list=$("reviewRequestList");
    try {
      const {error}=await db.rpc("review_branch_update_request",{
        p_request_id:requestId,p_decision:decision,p_review_note:note
      });
      if(error)throw error;
      await loadPendingRequests();
      if(window.refreshBranchContent)await window.refreshBranchContent();
    } catch(error) {
      const message=document.createElement("p");
      message.className="form-note error";
      message.textContent="Review failed: "+(error.message||"Check your role and database migration.");
      card?.appendChild(message);
      card?.querySelectorAll("button").forEach(b=>b.disabled=false);
    }
  });

  $("adminCreateForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const message=$("adminCreateStatus"), form=e.currentTarget, button=form.querySelector('button[type="submit"]');
    if(!db){message.textContent="Supabase is not configured.";return;}
    button.disabled=true;message.textContent="Saving…";
    try {
      const {data:{user},error:userError}=await db.auth.getUser();
      if(userError||!user)throw userError||new Error("Sign in required.");
      const type=$("adminItemType").value, title=$("adminItemTitle").value.trim(), body=$("adminItemBody").value.trim(), date=$("adminItemDate").value;
      let table,row;
      if(type==="notice"){table="notices";row={title,body,category:"general",status:"published",created_by:user.id};}
      else if(type==="deadline"){table="deadlines";row={title,description:body,due_at:date?new Date(date).toISOString():new Date(Date.now()+7*86400000).toISOString(),status:"upcoming",created_by:user.id};}
      else if(type==="event"){table="events";row={title,description:body,starts_at:date?new Date(date).toISOString():new Date(Date.now()+7*86400000).toISOString(),status:"published",created_by:user.id};}
      else {
        let u;try{u=new URL(body);}catch{throw new Error("For a resource, enter a complete https:// URL in the details field.");}
        if(!["https:","http:"].includes(u.protocol))throw new Error("Resource links must use http or https.");
        table="resources";row={title,description:"",url:u.href,category:"study",status:"published",created_by:user.id};
      }
      const {error}=await db.from(table).insert(row);
      if(error)throw error;
      message.textContent="Saved successfully.";form.reset();
      if(window.refreshBranchContent)await window.refreshBranchContent();
    } catch(error){message.textContent="Could not save: "+(error.message||"Unknown error");}
    finally{button.disabled=false;}
  });

  if(db) db.auth.onAuthStateChange(()=>{setTimeout(refreshAuth,0);});
  refreshAuth();
})();