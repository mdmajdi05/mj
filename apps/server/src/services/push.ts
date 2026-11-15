import webpush from 'web-push';
import { prisma } from '../middleware/auth';
const pub=process.env.VAPID_PUBLIC_KEY||'';
const priv=process.env.VAPID_PRIVATE_KEY||'';
if(pub&&priv)webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',pub,priv);
export async function sendGenericPush(userId:string){
 if(!pub||!priv)return;
 const preference=await prisma.notificationPreference.findUnique({where:{userId}});if(!preference?.browser)return;
 const subscriptions=await prisma.pushSubscription.findMany({where:{userId}});
 await Promise.all(subscriptions.map(async sub=>{
  try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:'Study with Game',body:'You have a new notification.'}))}
  catch(error:any){if(error?.statusCode===404||error?.statusCode===410)await prisma.pushSubscription.delete({where:{id:sub.id}}).catch(()=>{});else console.error('Web Push delivery failed',error?.message||error)}
 }));
}
