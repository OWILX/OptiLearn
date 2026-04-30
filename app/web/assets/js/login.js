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
