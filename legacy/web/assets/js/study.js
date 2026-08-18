document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', function() {
      const link = this.dataset.link;
      if (link) window.location.href = link;
    });
  });
});
