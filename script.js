
(() => {
  const $ = id => document.getElementById(id);
  const USERS_KEY = "nuja_tetris_users_v1";
  const SESSION_KEY = "nuja_tetris_session_v1";
  const ADMIN = "Anujin", ADMIN_PASSWORD = "Admin1234";
  const COLS = 10, ROWS = 20, CELL = 30;
  const SHAPES = [
    {m:[[1,1,1,1]],c:"#42e6ff"},
    {m:[[1,0,0],[1,1,1]],c:"#6588ff"},
    {m:[[0,0,1],[1,1,1]],c:"#ffad5c"},
    {m:[[1,1],[1,1]],c:"#ffe36e"},
    {m:[[0,1,1],[1,1,0]],c:"#66f0a8"},
    {m:[[0,1,0],[1,1,1]],c:"#c19aff"},
    {m:[[1,1,0],[0,1,1]],c:"#ff718b"}
  ];
  let mode="login", currentUser=null, isAdmin=false;
  let board, piece, nextShape, score=0, level=1, lines=0;
  let running=false, paused=false, gameOver=true, lastTime=0, dropCounter=0, raf=0;

  const canvas=$("game"), ctx=canvas.getContext("2d");
  const nextCanvas=$("next"), nctx=nextCanvas.getContext("2d");

  function getUsers(){try{return JSON.parse(localStorage.getItem(USERS_KEY)||"{}")}catch{return {}}}
  function saveUsers(u){localStorage.setItem(USERS_KEY,JSON.stringify(u))}
  function ensureAdmin(){
    const u=getUsers(), k=ADMIN.toLowerCase();
    if(!u[k]){u[k]={username:ADMIN,password:ADMIN_PASSWORD,admin:true,highScore:0,games:0};saveUsers(u)}
  }
  function message(t,ok=false){$("auth-message").textContent=t;$("auth-message").style.color=ok?"#66f0a8":"#ff718b"}
  function setMode(m){
    mode=m;$("login-tab").classList.toggle("active",m==="login");$("signup-tab").classList.toggle("active",m==="signup");
    $("auth-title").textContent=m==="login"?"Welcome back":"Create account";$("auth-submit").textContent=m==="login"?"Log in":"Create account";message("");
  }
  $("login-tab").onclick=()=>setMode("login");
  $("signup-tab").onclick=()=>setMode("signup");
  $("auth-form").addEventListener("submit",e=>{
    e.preventDefault();ensureAdmin();
    const name=$("username").value.trim(), pass=$("password").value, key=name.toLowerCase();
    if(!/^[A-Za-z0-9_]{3,20}$/.test(name))return message("Username: 3–20 letters, numbers or underscores.");
    if(pass.length<4)return message("Password must be at least 4 characters.");
    const users=getUsers();
    if(mode==="signup"){
      if(users[key])return message("That username is already taken.");
      users[key]={username:name,password:pass,admin:false,highScore:0,games:0};saveUsers(users);
      setMode("login");$("username").value=name;$("password").value="";return message("Account created. Log in now.",true);
    }
    if(!users[key]||users[key].password!==pass)return message("Incorrect username or password.");
    currentUser=users[key].username;isAdmin=!!users[key].admin;localStorage.setItem(SESSION_KEY,currentUser);showGame();
  });
  function showGame(){
    $("auth-screen").classList.add("hidden");$("game-screen").classList.remove("hidden");$("current-user").textContent=currentUser;
    $("player-view").classList.toggle("hidden",isAdmin);$("admin-view").classList.toggle("hidden",!isAdmin);
    if(isAdmin)renderAdmin();else{updateStats();renderLeaderboard();resetGame(false)}
  }
  function logout(){stopLoop();currentUser=null;isAdmin=false;localStorage.removeItem(SESSION_KEY);$("game-screen").classList.add("hidden");$("auth-screen").classList.remove("hidden");$("password").value=""}
  $("logout-btn").onclick=logout;
  $("admin-play-btn").onclick=()=>{isAdmin=false;$("admin-view").classList.add("hidden");$("player-view").classList.remove("hidden");resetGame(false)};
  function updateStats(){const u=getUsers()[String(currentUser).toLowerCase()];$("score").textContent=score;$("high-score").textContent=u?.highScore||0;$("level").textContent=level}
  function renderLeaderboard(){
    const arr=Object.values(getUsers()).filter(u=>!u.admin).sort((a,b)=>(b.highScore||0)-(a.highScore||0)).slice(0,5), list=$("leaderboard");list.innerHTML="";
    if(!arr.length){list.innerHTML="<li>No scores yet</li>";return}
    arr.forEach(u=>{const li=document.createElement("li");li.textContent=u.username+" ";const s=document.createElement("span");s.textContent=u.highScore||0;li.appendChild(s);list.appendChild(li)});
  }
  function renderAdmin(){
    const all=Object.values(getUsers()), players=all.filter(u=>!u.admin);
    $("user-count").textContent=players.length;$("games-count").textContent=players.reduce((a,u)=>a+(u.games||0),0);
    $("admin-top-score").textContent=players.reduce((a,u)=>Math.max(a,u.highScore||0),0);
    const tbody=$("users-table");tbody.innerHTML="";
    all.sort((a,b)=>(b.highScore||0)-(a.highScore||0)).forEach(u=>{const tr=document.createElement("tr");[u.username+(u.admin?" (admin)":""),u.highScore||0,u.games||0].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)});tbody.appendChild(tr)});
  }
  const clone=m=>m.map(r=>r.slice()), random=()=>SHAPES[Math.floor(Math.random()*SHAPES.length)];
  function makePiece(s){const m=clone(s.m);return{matrix:m,color:s.c,x:Math.floor((COLS-m[0].length)/2),y:0}}
  function resetGame(auto=false){
    stopLoop();board=Array.from({length:ROWS},()=>Array(COLS).fill(null));score=0;level=1;lines=0;dropCounter=0;
    nextShape=random();piece=makePiece(random());running=auto;paused=false;gameOver=false;
    $("game-status").textContent=auto?"Playing":"Ready";$("pause-btn").textContent="Ⅱ Pause";updateStats();draw();drawNext();if(auto)startLoop();
  }
  function collides(p,dx=0,dy=0,m=p.matrix){
    for(let y=0;y<m.length;y++)for(let x=0;x<m[y].length;x++)if(m[y][x]){
      const bx=p.x+x+dx,by=p.y+y+dy;if(bx<0||bx>=COLS||by>=ROWS)return true;if(by>=0&&board[by][bx])return true;
    }return false;
  }
  function merge(){piece.matrix.forEach((r,y)=>r.forEach((v,x)=>{if(v&&piece.y+y>=0)board[piece.y+y][piece.x+x]=piece.color}))}
  function spawn(){piece=makePiece(nextShape);nextShape=random();drawNext();if(collides(piece))finishGame()}
  function clearLines(){let n=0;for(let y=ROWS-1;y>=0;y--)if(board[y].every(Boolean)){board.splice(y,1);board.unshift(Array(COLS).fill(null));n++;y++}
    if(n){lines+=n;score+=([0,100,300,500,800][n]||800)*level;level=Math.floor(lines/10)+1;updateStats()}}
  function lock(){merge();clearLines();spawn();draw()}
  function left(){if(piece&&!gameOver&&!paused&&!collides(piece,-1,0)){piece.x--;draw()}}
  function right(){if(piece&&!gameOver&&!paused&&!collides(piece,1,0)){piece.x++;draw()}}
  function down(){if(!piece||gameOver||paused)return;if(!collides(piece,0,1)){piece.y++;score++;updateStats()}else lock();draw()}
  function rotate(){if(!piece||gameOver||paused)return;const m=piece.matrix[0].map((_,i)=>piece.matrix.map(r=>r[i]).reverse());for(const d of [0,-1,1,-2,2])if(!collides(piece,d,0,m)){piece.x+=d;piece.matrix=m;draw();return}}
  function drop(){if(!piece||gameOver||paused)return;let n=0;while(!collides(piece,0,1)){piece.y++;n++}score+=n*2;updateStats();lock()}
  function cell(c,x,y,s,color){c.fillStyle=color;c.fillRect(x*s+1,y*s+1,s-2,s-2);c.fillStyle="#ffffff24";c.fillRect(x*s+3,y*s+3,s-6,3);c.strokeStyle="#ffffff35";c.strokeRect(x*s+1.5,y*s+1.5,s-3,s-3)}
  function draw(){
    if(!board)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#070c16";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="#1a2940";for(let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(x*CELL,0);ctx.lineTo(x*CELL,ROWS*CELL);ctx.stroke()}for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*CELL);ctx.lineTo(COLS*CELL,y*CELL);ctx.stroke()}
    board.forEach((r,y)=>r.forEach((c,x)=>{if(c)cell(ctx,x,y,CELL,c)}));if(piece)piece.matrix.forEach((r,y)=>r.forEach((v,x)=>{if(v)cell(ctx,piece.x+x,piece.y+y,CELL,piece.color)}));
    if(paused||gameOver){ctx.fillStyle="#060b16cc";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#edf4ff";ctx.textAlign="center";ctx.font="bold 23px system-ui";ctx.fillText(gameOver?"TAP START":"PAUSED",150,305)}
  }
  function drawNext(){nctx.clearRect(0,0,120,120);nctx.fillStyle="#080f1d";nctx.fillRect(0,0,120,120);if(!nextShape)return;const m=nextShape.m,s=24,ox=(120-m[0].length*s)/2,oy=(120-m.length*s)/2;m.forEach((r,y)=>r.forEach((v,x)=>{if(v){nctx.fillStyle=nextShape.c;nctx.fillRect(ox+x*s+1,oy+y*s+1,s-3,s-3)}}))}
  function tick(t=0){if(!running||paused||gameOver)return;dropCounter+=t-lastTime;lastTime=t;if(dropCounter>Math.max(100,800-(level-1)*60)){down();dropCounter=0}if(running&&!paused&&!gameOver)raf=requestAnimationFrame(tick)}
  function startLoop(){cancelAnimationFrame(raf);lastTime=performance.now();raf=requestAnimationFrame(tick)}
  function stopLoop(){running=false;cancelAnimationFrame(raf)}
  function finishGame(){gameOver=true;running=false;cancelAnimationFrame(raf);$("game-status").textContent="Game over";$("start-btn").textContent="▶ Play again";const users=getUsers(),key=currentUser.toLowerCase(),u=users[key];if(u){u.games=(u.games||0)+1;u.highScore=Math.max(u.highScore||0,score);users[key]=u;saveUsers(users)}updateStats();renderLeaderboard();draw()}
  $("start-btn").onclick=()=>resetGame(true);
  $("pause-btn").onclick=()=>{if(gameOver)return;paused=!paused;if(paused){$("game-status").textContent="Paused";$("pause-btn").textContent="▶ Resume";cancelAnimationFrame(raf)}else{$("game-status").textContent="Playing";$("pause-btn").textContent="Ⅱ Pause";startLoop()}draw()};
  $("mobile-controls").addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(!b)return;({left,right,rotate,down,drop})[b.dataset.action]?.()});
  document.addEventListener("keydown",e=>{if($("game-screen").classList.contains("hidden")||isAdmin)return;const f={"ArrowLeft":left,"ArrowRight":right,"ArrowUp":rotate,"ArrowDown":down," ":drop};if(f[e.key]){e.preventDefault();f[e.key]()}},{passive:false});
  let touch=null;canvas.addEventListener("touchstart",e=>{const t=e.changedTouches[0];touch={x:t.clientX,y:t.clientY}},{passive:true});
  canvas.addEventListener("touchend",e=>{if(!touch)return;const t=e.changedTouches[0],dx=t.clientX-touch.x,dy=t.clientY-touch.y;if(Math.max(Math.abs(dx),Math.abs(dy))<18)rotate();else if(Math.abs(dx)>Math.abs(dy))(dx<0?left:right)();else if(dy>85)drop();else if(dy>0)down();touch=null},{passive:true});
  ensureAdmin();const session=localStorage.getItem(SESSION_KEY);if(session){const u=getUsers()[session.toLowerCase()];if(u){currentUser=u.username;isAdmin=!!u.admin;showGame()}}
  if(!$("auth-screen").classList.contains("hidden"))setMode("login");
})();
'''
}
for name, content in files.items():
    with open(os.path.join(base, name), "w", encoding="utf-8") as f:
        f.write(content)
zip_path = "/mnt/data/NUJA_Tetris_mobile_website.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for name in files:
        z.write(os.path.join(base, name), arcname=name)
print("Created NUJA Tetris source files and ZIP.")
print("Files: index.html, style.css, script.js")
print("ZIP: " + zip_path)
print("Note: demo accounts/scores are stored in browser localStorage; client-side admin credentials are not secure for production.")
