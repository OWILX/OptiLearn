let totalSeconds = 3600;

const timer = document.getElementById("timer");

function updateTimer(){

const hours = Math.floor(totalSeconds / 3600);
const minutes = Math.floor((totalSeconds % 3600) / 60);
const seconds = totalSeconds % 60;

const formatted =
String(hours).padStart(2,'0') + ':' +
String(minutes).padStart(2,'0') + ':' +
String(seconds).padStart(2,'0');


timer.textContent = formatted;

if(totalSeconds > 0){
    totalSeconds--;
}
}

setInterval(updateTimer,1000);
updateTimer();
