// Optional Vercel endpoint. Keep OPENAI_API_KEY in Vercel, never in browser code.
const allowedOrigins=(process.env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
module.exports=async function handler(req,res){
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  const origin=req.headers.origin;
  if(origin&&allowedOrigins.includes(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");}
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(origin&&!allowedOrigins.includes(origin))return res.status(403).json({error:"Origin is not allowed"});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"AI assistant is not configured. Set OPENAI_API_KEY in Vercel."});
  let body=req.body;if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON"});}}
  const question=String(body?.message||"").trim();
  if(question.length<1||question.length>1500)return res.status(400).json({error:"Message must be 1–1500 characters"});
  const context=Array.isArray(body?.context)?body.context.slice(-6).map(m=>({role:m?.role==="assistant"?"assistant":"user",content:String(m?.content||"").slice(0,1500)})):[];
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const upstream=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4o-mini",messages:[{role:"system",content:"You are the GGV AI & DS Branch Hub assistant for Guru Ghasidas Vishwavidyalaya, Bilaspur. Explain AI/Data Science concepts and how to use this hub. Do not invent official notices, timetables, deadlines, staff contacts or university policies. If verified data is not supplied, ask the user to confirm with branch faculty. Never claim to have changed records."},...context,{role:"user",content:question}],max_tokens:500,temperature:.3}),signal:controller.signal});
    const data=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return res.status(502).json({error:"AI provider request failed. Check Vercel logs, API access and billing."});
    const answer=data?.choices?.[0]?.message?.content;
    if(!answer)return res.status(502).json({error:"AI provider returned an empty response"});
    return res.status(200).json({answer});
  }catch(error){return res.status(502).json({error:error.name==="AbortError"?"AI request timed out":"Could not reach AI provider"});}
  finally{clearTimeout(timeout);}
};