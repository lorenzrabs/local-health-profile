import { openDatabase, syncHealthKitBatch, syncHabitBatch, upsertHabitDefinition } from '../apps/web/src/server/db';
import { createApp } from '../apps/web/src/server/app';
import { localDate, shiftDate } from '../apps/web/src/shared/dates';
const db=openDatabase(':memory:');db.prepare('UPDATE habit_definitions SET is_active=0').run();
const names=['Spaziergang','Späte Mahlzeit','Abendroutine','Kaffee nach 15 Uhr','Krafttraining','Alkohol','Lesen','Meditation'];
names.forEach((name,i)=>upsertHabitDefinition(db,{clientId:'preview-'+i,name,isActive:true,sortOrder:i}));
upsertHabitDefinition(db,{clientId:'preview-archived',name:'ARCHIVIERT TEST',isActive:false,sortOrder:10});
const today=localDate(),samples:any[]=[],workouts:any[]=[],entries:any[]=[];
for(let i=0;i<90;i++){
 const date=shiftDate(today,i-89),prev=shiftDate(date,-1);
 names.forEach((_,n)=>{if(i%13!==0)entries.push({habitClientId:'preview-'+n,date,completed:(i+n)%3===0,updatedAt:date+'T00:00:00Z'});});
 const values:any={restingHeartRate:61-i*.03+((i-1)%3===2?4:0)+Math.sin(i)*.6,heartRateVariabilitySDNN:50+i*.1+Math.cos(i)*4,stepCount:7000+Math.sin(i)*1700,vo2Max:46+i*.025,activeEnergyBurned:480+Math.cos(i)*100};
 for(const [type,value] of Object.entries(values))samples.push({sourceId:type+i,type,unit:type==='stepCount'?'count':'unit',value,startAt:date+'T07:00:00Z',endAt:date+'T07:01:00Z'});
 samples.push({sourceId:'sleep'+i,type:'sleepAnalysis',unit:'stage',value:3,startAt:prev+'T22:00:00Z',endAt:date+(i%3===0?'T05:00:00Z':'T06:00:00Z')});
 if(i%3===0)workouts.push({sourceId:'run'+i,activityType:'running',startAt:date+'T16:00:00Z',endAt:date+'T16:45:00Z',durationSeconds:2700,distanceMeters:7500});
}
syncHealthKitBatch(db,{samples,workouts});syncHabitBatch(db,{entries});
const app=await createApp(db,{port:3012,dev:false});
const server=app.listen(3012,'127.0.0.1',()=>console.log('Synthetic preview ready on http://127.0.0.1:3012'));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
