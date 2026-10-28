(() => {
  const fab=document.getElementById("chatFab"),panel=document.getElementById("chatPanel");
  const form=document.getElementById("chatForm"),input=document.getElementById("chatInput"),messages=document.getElementById("chatMessages");
  const history=[];
  function add(role,value){const el=document.createElement("div");el.className="chat-message "+role;el.textContent=value;messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el;}
  fab?.addEventListener("click",()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus();});
  document.getElementById("chatClose")?.addEventListener("click",()=>panel.hidden=true);
  form?.addEventListener("submit",async e=>{
    e.preventDefault();const message=input.value.trim();if(!message)return;
    input.value="";add("user",message);
    const pending=add("assistant","Thinking…");
    const base=(window.BRANCH_HUB_CONFIG?.API_BASE_URL||"").replace(/\/$/,"");
    if(!base){pending.textContent="The AI assistant is not connected. Deploy the optional Vercel API and set API_BASE_URL in config.js.";return;}
    try{
      const response=await fetch(base+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,context:history})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Chat service unavailable.");
      pending.textContent=result.answer;
      history.push({role:"user",content:message},{role:"assistant",content:result.answer});
      while(history.length>8)history.shift();
    }catch(error){pending.textContent=(error.message||"Chat service unavailable.")+" Verify the Vercel API configuration.";}
    messages.scrollTop=messages.scrollHeight;
  });
})();