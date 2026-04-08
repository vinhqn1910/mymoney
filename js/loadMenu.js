document.addEventListener("DOMContentLoaded", function(){
    fetch("menu.html")
    .then(res => res.text())
    .then(data => {
      const el = document.getElementById("sidebar");
      if(!el){
        console.error("Không tìm thấy #sidebar");
        return;
      }
      el.innerHTML = data;
  
      const links = document.querySelectorAll('.sidebar a');
      links.forEach(link => {
        if (link.href === window.location.href) {
          link.classList.add('active');
        }
      });
    })
    .catch(err => console.error("Lỗi load menu:", err));
  });