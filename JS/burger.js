const burger = document.getElementById('burger');
const nav = document.getElementById('main-nav');

burger.addEventListener('click', () => {
    nav.classList.toggle('open');
    burger.classList.toggle('active');
});