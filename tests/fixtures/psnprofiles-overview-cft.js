const root = document.querySelector('#metacritic-root');
const isDetail = location.pathname.endsWith('-detail.html');

root.innerHTML = `
  <section class="fixture-card">
    <div class="overview-info">
      <span class="tag">
        <span class="typo-top">3/10</span><br />
        <span class="typo-bottom">Difficulty</span>
      </span>
      <span class="tag">
        <span class="typo-top">1</span><br />
        <span class="typo-bottom">Playthrough</span>
      </span>
      <span class="tag">
        <span class="typo-top">20</span><br />
        <span class="typo-bottom">Hours</span>
      </span>
    </div>
    <h1>${isDetail ? 'Star Wars Zero Company' : 'Metacritic Latest News'}</h1>
    <h2>Latest News</h2>
    <p>${isDetail ? 'Detail route story' : 'Homepage story'} contains enough deterministic English content to exercise the packaged extension.</p>
  </section>
  ${isDetail
    ? '<p><a href="/tests/fixtures/psnprofiles-overview-cft.html">Return to homepage</a></p>'
    : '<section class="fixture-card"><h2>New and Notable</h2><p><a href="/tests/fixtures/psnprofiles-overview-cft-detail.html">Star Wars Zero Company</a></p></section>'}
`;
