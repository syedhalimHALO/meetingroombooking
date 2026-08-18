(() => {
  'use strict';
  const C = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const DAY_START = 8 * 60, DAY_END = 19 * 60, SLOT = 30, ROW_H = 48;
  let db, session, room, viewMonth = firstMonth(new Date()), selectedDate, monthBookings = [], activeBooking, channel;

  function configured(){ return C.supabaseUrl && C.supabaseAnonKey && !C.supabaseUrl.startsWith('YOUR_') && !C.supabaseAnonKey.startsWith('YOUR_'); }
  function firstMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function key(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function sameDay(a,b){ return key(a) === key(b); }
  function labelTime(min){ const h=Math.floor(min/60),m=min%60,p=h>=12?'PM':'AM'; return `${h%12||12}:${String(m).padStart(2,'0')} ${p}`; }
  function dateAt(d,min){ return new Date(d.getFullYear(),d.getMonth(),d.getDate(),Math.floor(min/60),min%60,0,0); }
  function bookingMinutes(iso){ const d=new Date(iso); return d.getHours()*60+d.getMinutes(); }
  function show(id){ $(id).classList.add('show'); const focus=$(id).querySelector('input,button,select'); setTimeout(()=>focus?.focus(),0); }
  function hide(id){ $(id).classList.remove('show'); }
  function toast(message){ const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2800); }
  function setBusy(button,busy,label){ button.disabled=busy; button.dataset.label ||= button.textContent; button.textContent=busy?label:button.dataset.label; }

  function renderClock(){ const n=new Date(); $('clock').textContent=n.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); $('todayLabel').textContent=n.toLocaleDateString('en-MY',{weekday:'short',day:'numeric',month:'short'}); }
  function setupStaticEvents(){
    $('prevMonth').onclick=()=>{ viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()-1,1); loadMonth(); };
    $('nextMonth').onclick=()=>{ viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,1); loadMonth(); };
    $('todayBtn').onclick=()=>{ viewMonth=firstMonth(new Date()); loadMonth(); };
    document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
    document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o && o.id!=='setupOverlay') hide(o.id); }));
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.overlay.show:not(#setupOverlay)').forEach(o=>hide(o.id)); });
    $('backToSchedule').onclick=()=>{ hide('bookingOverlay'); show('dayOverlay'); };
    $('backFromDetail').onclick=()=>{ hide('detailOverlay'); show('dayOverlay'); };
    $('authForm').onsubmit=sendMagicLink; $('azureBtn').onclick=signInAzure; $('bookingForm').onsubmit=createBooking; $('cancelBooking').onclick=cancelBooking;
    $('accountBtn').onclick=async()=>{ if(!session) return show('authOverlay'); if(confirm('Sign out from this device?')) await db.auth.signOut(); };
  }

  async function init(){
    renderClock(); setInterval(renderClock,15000); setupStaticEvents();
    if(!configured()){ show('setupOverlay'); return; }
    db=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session:s}}=await db.auth.getSession(); await onAuth(s);
    db.auth.onAuthStateChange((_event,sess)=>setTimeout(()=>onAuth(sess),0));
  }
  async function onAuth(next){
    session=next; $('accountBtn').textContent=session?(session.user.user_metadata.full_name||session.user.email):'Sign in';
    if(!session){ cleanupRealtime(); monthBookings=[]; renderMonth(); show('authOverlay'); return; }
    hide('authOverlay'); $('azureBtn').classList.toggle('hidden',!C.enableAzureLogin);
    await loadRoom(); if(room){ subscribeRealtime(); await loadMonth(); }
  }
  async function sendMagicLink(e){
    e.preventDefault(); const email=$('authEmail').value.trim(),button=e.submitter;
    if(C.allowedEmailDomain && !email.toLowerCase().endsWith('@'+C.allowedEmailDomain.toLowerCase())){ $('authMessage').textContent=`Use your @${C.allowedEmailDomain} work email.`; return; }
    setBusy(button,true,'Sending…'); const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('#')[0]}}); setBusy(button,false);
    $('authMessage').textContent=error?error.message:'Magic link sent. Check your email inbox.';
  }
  async function signInAzure(){ await db.auth.signInWithOAuth({provider:'azure',options:{scopes:'email',redirectTo:location.href.split('#')[0]}}); }
  async function loadRoom(){
    const {data,error}=await db.from('rooms').select('*').eq('slug',C.roomSlug).eq('active',true).single();
    if(error){ toast('Room configuration could not be loaded.'); console.error(error); return; }
    room=data; $('roomName').textContent=room.name; $('roomMeta').textContent=`${room.department||'Meeting Room'} · Capacity ${room.capacity} · ${room.location||'Location —'}`; $('attendees').max=room.capacity;
  }
  function subscribeRealtime(){
    cleanupRealtime(); channel=db.channel(`room-${room.id}`).on('postgres_changes',{event:'*',schema:'public',table:'bookings',filter:`room_id=eq.${room.id}`},()=>loadMonth()).subscribe();
  }
  function cleanupRealtime(){ if(channel&&db) db.removeChannel(channel); channel=null; }

  async function loadMonth(){
    if(!room||!session) return; $('monthGrid').innerHTML='<p style="grid-column:1/-1;text-align:center">Loading schedule…</p>';
    const start=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1),end=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,1);
    const {data,error}=await db.from('bookings').select('id,room_id,user_id,purpose,attendees,start_at,end_at,booked_by_name,department,status').eq('room_id',room.id).eq('status','confirmed').gte('start_at',start.toISOString()).lt('start_at',end.toISOString()).order('start_at');
    if(error){ toast('Could not load bookings.'); monthBookings=[]; } else monthBookings=data||[];
    renderMonth(); renderStatus(); if(selectedDate&&$('dayOverlay').classList.contains('show')) renderTimeline();
  }
  function renderMonth(){
    $('monthCurrent').textContent=viewMonth.toLocaleDateString('en-MY',{month:'long',year:'numeric'}); const grid=$('monthGrid'); grid.innerHTML='';
    const today=new Date(),offset=viewMonth.getDay(),days=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,0).getDate();
    for(let i=0;i<offset;i++){ const e=document.createElement('span'); e.className='day-cell empty'; grid.append(e); }
    for(let day=1;day<=days;day++){
      const d=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),day),past=d<new Date(today.getFullYear(),today.getMonth(),today.getDate()),items=monthBookings.filter(b=>sameDay(new Date(b.start_at),d));
      const b=document.createElement('button'); b.type='button'; b.className='day-cell'+(sameDay(d,today)?' today':''); b.disabled=past||!session; b.setAttribute('aria-label',`${d.toLocaleDateString('en-MY',{day:'numeric',month:'long'})}, ${items.length} bookings`); b.onclick=()=>openDay(d);
      const num=document.createElement('span'); num.className='day-num'; num.textContent=day; b.append(num);
      items.slice(0,2).forEach(x=>{ const chip=document.createElement('span'); chip.className='day-chip'; chip.textContent=`${new Date(x.start_at).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})} ${x.purpose}`; b.append(chip); });
      if(items.length>2){ const more=document.createElement('span'); more.className='day-more'; more.textContent=`+${items.length-2} more`; b.append(more); } grid.append(b);
    }
  }
  function dayBookings(){ return monthBookings.filter(b=>selectedDate&&sameDay(new Date(b.start_at),selectedDate)).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)); }
  function openDay(d){ selectedDate=new Date(d); $('dayTitle').textContent=d.toLocaleDateString('en-MY',{weekday:'long',day:'numeric',month:'long'}); renderTimeline(); show('dayOverlay'); }
  function renderTimeline(){
    const box=$('timeline'),items=dayBookings(),now=new Date(); box.innerHTML='';
    for(let min=DAY_START;min<DAY_END;min+=SLOT){ const row=document.createElement('div'); row.className='slot-row'; const label=document.createElement('span'); label.className='slot-time'; label.textContent=labelTime(min); const button=document.createElement('button'); button.type='button'; button.className='slot-button'; const occupied=items.some(b=>min<bookingMinutes(b.end_at)&&min+SLOT>bookingMinutes(b.start_at)),past=dateAt(selectedDate,min)<=now; button.disabled=occupied||past; button.textContent=button.disabled?'':'+ Book'; button.onclick=()=>openBooking(min); row.append(label,button); box.append(row); }
    items.forEach(item=>{ const start=bookingMinutes(item.start_at),end=bookingMinutes(item.end_at),b=document.createElement('button'); b.type='button'; b.className='event-block'; b.style.top=`${(start-DAY_START)/SLOT*ROW_H+2}px`; b.style.height=`${Math.max((end-start)/SLOT*ROW_H-4,28)}px`; const title=document.createElement('div'); title.className='event-title'; title.textContent=item.purpose; const meta=document.createElement('div'); meta.className='event-meta'; meta.textContent=`${labelTime(start)}–${labelTime(end)} · ${item.booked_by_name}`; b.append(title,meta); b.onclick=()=>openDetail(item); box.append(b); });
    if(sameDay(now,selectedDate)){ const min=now.getHours()*60+now.getMinutes(); if(min>=DAY_START&&min<=DAY_END){ const line=document.createElement('div'); line.className='now-line'; line.style.top=`${(min-DAY_START)/SLOT*ROW_H}px`; box.append(line); } }
  }
  function openBooking(start){
    hide('dayOverlay'); $('bookingForm').reset(); $('attendees').value=4; $('attendees').max=room.capacity; $('bookingError').textContent=''; $('bookingDate').textContent=selectedDate.toLocaleDateString('en-MY',{weekday:'long',day:'numeric',month:'long'}); fillTimes(start); show('bookingOverlay');
  }
  function fillTimes(start){ const s=$('startTime'),e=$('endTime'); s.innerHTML=''; e.innerHTML=''; for(let m=DAY_START;m<DAY_END;m+=SLOT) s.add(new Option(labelTime(m),m)); s.value=start; updateEnds(); s.onchange=updateEnds; function updateEnds(){ e.innerHTML=''; const from=Number(s.value),nextStart=dayBookings().map(b=>bookingMinutes(b.start_at)).filter(m=>m>from).sort((a,b)=>a-b)[0]||DAY_END; for(let m=from+SLOT;m<=Math.min(nextStart,DAY_END);m+=SLOT)e.add(new Option(labelTime(m),m)); e.value=Math.min(from+60,Number(e.options[e.options.length-1]?.value)); } }
  async function createBooking(event){
    event.preventDefault(); const button=$('submitBooking'),start=Number($('startTime').value),end=Number($('endTime').value); $('bookingError').textContent=''; setBusy(button,true,'Booking…');
    const {error}=await db.rpc('create_booking',{p_room_slug:C.roomSlug,p_purpose:$('purpose').value.trim(),p_attendees:Number($('attendees').value),p_start_at:dateAt(selectedDate,start).toISOString(),p_end_at:dateAt(selectedDate,end).toISOString()}); setBusy(button,false);
    if(error){ $('bookingError').textContent=error.message.includes('already booked')?'That time was just booked. Please choose another slot.':error.message; return; }
    hide('bookingOverlay'); toast('Booking confirmed.'); await loadMonth(); show('dayOverlay');
  }
  function openDetail(item){
    activeBooking=item; hide('dayOverlay'); const pairs=[['Purpose',item.purpose],['Booked by',item.booked_by_name],['Department',item.department||'—'],['Time',`${new Date(item.start_at).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})} – ${new Date(item.end_at).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})}`],['Attendees',item.attendees]]; const box=$('bookingDetails'); box.innerHTML=''; pairs.forEach(([a,v])=>{ const row=document.createElement('div'); row.className='detail-row'; const l=document.createElement('span'),val=document.createElement('span'); l.textContent=a; val.textContent=v; row.append(l,val); box.append(row); }); $('cancelBooking').classList.toggle('hidden',item.user_id!==session.user.id); show('detailOverlay');
  }
  async function cancelBooking(){
    if(!activeBooking||!confirm('Cancel this booking? This action will be recorded.')) return; const button=$('cancelBooking'); setBusy(button,true,'Cancelling…'); const {error}=await db.rpc('cancel_booking',{p_booking_id:activeBooking.id}); setBusy(button,false); if(error){ toast(error.message); return; } hide('detailOverlay'); toast('Booking cancelled.'); await loadMonth(); show('dayOverlay');
  }
  function renderStatus(){
    const now=new Date(),today=monthBookings.filter(b=>sameDay(new Date(b.start_at),now)),current=today.find(b=>now>=new Date(b.start_at)&&now<new Date(b.end_at)),next=today.find(b=>new Date(b.start_at)>now),pill=$('statusPill');
    pill.className='status-pill '+(current?'busy':'free'); $('statusText').textContent=current?'IN USE':'AVAILABLE'; $('statusNote').textContent=current?`${current.purpose} · until ${new Date(current.end_at).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})}`:next?`Available until ${new Date(next.start_at).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})}`:'Available for the rest of today';
  }
  init().catch(error=>{ console.error(error); toast('The application could not start.'); });
})();
