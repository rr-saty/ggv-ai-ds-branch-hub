// Public requests are always marked pending_review; this endpoint cannot approve a notice or send bulk email.
const allowedOrigins=(process.env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
function cors(req,res){
  const origin=req.headers.origin;
  if(origin&&allowedOrigins.includes(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");}
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
module.exports=async function handler(req,res){
  cors(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const origin=req.headers.origin;
  if(origin&&!allowedOrigins.includes(origin))return res.status(403).json({error:"Origin is not allowed"});
  const webhookUrl=process.env.ACTIVEPIECES_WEBHOOK_URL;
  const webhookSecret=process.env.ACTIVEPIECES_WEBHOOK_SECRET;
  if(!webhookUrl||!webhookSecret)return res.status(503).json({error:"Request intake is not configured. Set ACTIVEPIECES_WEBHOOK_URL and ACTIVEPIECES_WEBHOOK_SECRET in Vercel."});
  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON body"});}}
  if(!body||typeof body!=="object"||Array.isArray(body))return res.status(400).json({error:"Expected a JSON object"});
  const type=String(body.type||"");
  const title=String(body.title||"").trim();
  const details=String(body.details||"").trim();
  if(!["notice","deadline","event","resource"].includes(type))return res.status(400).json({error:"Unsupported request type"});
  if(title.length<3||title.length>160)return res.status(400).json({error:"Title must be 3–160 characters"});
  if(details.length<3||details.length>1200)return res.status(400).json({error:"Details must be 3–1200 characters"});
  let parsed;try{parsed=new URL(webhookUrl)}catch{return res.status(500).json({error:"ACTIVEPIECES_WEBHOOK_URL is invalid"});}
  if(parsed.protocol!=="https:")return res.status(500).json({error:"ACTIVEPIECES_WEBHOOK_URL must use HTTPS"});
  const forwarded={type,title,details,audience:String(body.audience||"AI & DS students").slice(0,80),date:String(body.date||"").slice(0,30)||null,source:"ggv-ai-ds-branch-hub",status:"pending_review",approved:false,submittedAt:new Date().toISOString()};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const upstream=await fetch(webhookUrl,{method:"POST",headers:{"Content-Type":"application/json","x-ggv-automation-secret":webhookSecret},body:JSON.stringify(forwarded),signal:controller.signal});
    if(!upstream.ok)return res.status(502).json({error:"Request queue returned an error. Check Activepieces run history."});
    return res.status(202).json({ok:true,message:"Request received for staff review. No official notice or email was sent."});
  }catch(error){return res.status(502).json({error:error.name==="AbortError"?"Request intake timed out":"Could not reach the request queue"});}
  finally{clearTimeout(timeout);}
};