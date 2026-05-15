import { client } from './supabase.js';

document.getElementById("signup-btn").addEventListener("click", async (e) => {
    e.preventDefault();
        //Sign-up
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    const { data, error } = await client.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: name
            }
        }
    });

    if(error){
        alert(error.message);
    } else {
        alert("Account created! Check your email.");
    }
});

//Log-in

document.getElementById("login-btn").addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });

    if(error){
        alert(error.message);
    } else {
        alert("Login successful!");

        window.location.href = "index.html";
    }
});

const { data } = await client.auth.getSession();

if(data.session){
   window.location.href = "home.html";
}
const supabaseUrl =  'https://jxdllmwdyvhcsdvodnbb.supabase.co/rest/v1/';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZGxsbXdkeXZoY3Nkdm9kbmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDg2OTgsImV4cCI6MjA5Mjg4NDY5OH0.KlkSqiB_KRT6aQdN-olzIo6sYLZQ0ECA9KBoUs6F44g';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

document.getElementById("signup-btn").addEventListener("click", async (e) => {
    e.preventDefault();
        //Sign-up
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: name
            }
        }
    });

    if(error){
        alert(error.message);
    } else {
        alert("Account created! Check your email.");
    }
})