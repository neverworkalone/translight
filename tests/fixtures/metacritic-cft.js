const root = document.querySelector('#metacritic-root');
const isDetail = location.pathname.endsWith('-detail.html');
const cardCount = isDetail ? 18 : 24;

function paragraph(label, index) {
  return `<p>${label} card ${index} contains enough deterministic English content to exercise incremental discovery, scrolling, and route cleanup in the packaged extension.</p>`;
}

function render() {
  const label = isDetail ? 'Detail route story' : 'Homepage story';
  const title = isDetail ? 'Star Wars Zero Company' : 'Metacritic Latest News';
  const section = isDetail ? 'Reviews and Details' : 'Latest News';
  root.innerHTML = `
    <section class="fixture-card">
      <h1>${title}</h1>
      <h2>${section}</h2>
      ${Array.from({length: cardCount}, (_, index) => `
        <article class="fixture-card">
          <h3>${label} headline ${index}</h3>
          ${paragraph(label, index)}
          <p>${label} supporting paragraph ${index} keeps the page tall enough for viewport-priority queue work.</p>
        </article>
      `).join('')}
    </section>
    ${isDetail ? '<p><a href="/tests/fixtures/metacritic-cft.html">Return to Metacritic home</a></p>' : `
      <section class="fixture-card">
        <h2>New and Notable</h2>
        <p><a href="/tests/fixtures/metacritic-cft-detail.html">Star Wars Zero Company</a></p>
      </section>
    `}
  `;
}

render();
