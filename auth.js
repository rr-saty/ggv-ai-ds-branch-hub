(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const db = window.branchSupabase;
  const status = $("authStatus");
  const modal = $("loginPanel");
  const adminPanel = $("adminPanel");
  const loginButton = $("loginOpen");
  const loginForm = $("loginForm");
  const modalStatus = $("authStatusModal");
  const setStatus = value => { if(status) status.textContent=value; };
  const openModal = () => { modal.hidden=false; $("loginEmail")?.focus(); };
  const closeModal = () => { modal.hidden=true; if(modalStatus)modalStatus.textContent=""; };
  loginButton?.addEventListener("click",openModal);
  $("loginClose")?.addEventListener("click",closeModal);
  modal?.addEventListener("click",e=>{if(e.target===modal)closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

  async function refreshAuth() {
    if(!db) {
      setStatus("Supabase not configured");
      if(loginButton)loginButton.classList.remove("hidden");
      if(adminPanel)adminPanel.hidden=true;
      return;
    }
    try {
      const {data:{session},error:sessionError}=await db.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session) {
        if(loginButton)loginButton.classList.remove("hidden");
        if(adminPanel)adminPanel.hidden=true;
        setStatus("Staff sign in");
        return;
      }
      const {data:profile,error}=await db.from("profiles").select("display_name,role").eq("id",session.user.id).maybeSingle();
      if(error)throw error;
      const role=profile?.role || "student";
      const staff=["faculty","admin"].includes(role);
      if(loginButton)loginButton.classList.toggle("hidden",true);
      if(adminPanel)adminPanel.hidden=!staff;
      setStatus((profile?.display_name || session.user.email || "Signed in")+" · "+role);
      if(!staff) setStatus((profile?.display_name || session.user.email || "Signed in")+" · student (read only)");
      if(window.refreshBranchContent) await window.refreshBranchContent();
    } catch(error) {
      setStatus("Auth setup needed");
      if(adminPanel)adminPanel.hidden=true;
      if(modalStatus)modalStatus.textContent="Could not load profile: "+(error.message||"Check whether the Supabase migration has been applied.");
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