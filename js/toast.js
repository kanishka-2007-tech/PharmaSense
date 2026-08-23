/* Minimal toast notifications. Requires a <div class="toast-stack" id="toastStack"> in the page. */

function toast(message, type = "info"){
  let stack = document.getElementById("toastStack");
  if(!stack){
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.id = "toastStack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
