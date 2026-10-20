import {json,sameOrigin,cookieClear} from "../../_finance.js";
export async function onRequestPost({request}){
 if(!sameOrigin(request))return json({error:"Invalid request"},403);
 const response=json({ok:true});
 response.headers.append("set-cookie",cookieClear("view"));
 response.headers.append("set-cookie",cookieClear("admin"));
 return response;
}
