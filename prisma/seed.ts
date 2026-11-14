import 'dotenv/config';
import { PrismaClient,Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma=new PrismaClient();
async function main(){
 const hp=process.env.HOST_INITIAL_PASSWORD,gp=process.env.GUEST_INITIAL_PASSWORD;
 if(!hp||!gp)throw new Error('Set HOST_INITIAL_PASSWORD and GUEST_INITIAL_PASSWORD before starting.');
 for(const [username,role,password] of [['host',Role.HOST,hp],['guest',Role.GUEST,gp]] as const){
  await prisma.user.upsert({where:{username},update:role===Role.HOST?{chatUnlocked:true}:{},create:{username,role,chatUnlocked:role===Role.HOST,passwordHash:await bcrypt.hash(password,12)}});
 }
 await prisma.game.createMany({data:[{slug:'word-typing',name:'Word Typing'},{slug:'falling-words',name:'Falling Words'},{slug:'memory-match',name:'Memory Match'}],skipDuplicates:true});
 const promo=process.env.INITIAL_PROMO_CODE;
 if(promo){const existing=await prisma.accessCode.findFirst({where:{purpose:'PROMO'}});if(!existing)await prisma.accessCode.create({data:{purpose:'PROMO',codeHash:await bcrypt.hash(promo,12)}})}
 const host=await prisma.user.findUniqueOrThrow({where:{username:'host'}});
 const guest=await prisma.user.findUniqueOrThrow({where:{username:'guest'}});
 await prisma.notificationPreference.createMany({data:[{userId:host.id},{userId:guest.id}],skipDuplicates:true});
 await prisma.userPreference.createMany({data:[{userId:host.id},{userId:guest.id}],skipDuplicates:true});
 await prisma.screenPreference.createMany({data:[{userId:host.id,screen:'HOME',chatVisible:true},{userId:guest.id,screen:'HOME',chatVisible:true}],skipDuplicates:true});
 console.log('Seeded accounts: host, guest. Promo code configured:', Boolean(promo));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
