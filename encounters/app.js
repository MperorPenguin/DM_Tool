// Root small helpers and sample party seeder
(function(){
  const load = (k,d)=>JSON.parse(localStorage.getItem(k)||JSON.stringify(d));
  const save = (k,v)=>localStorage.setItem(k, JSON.stringify(v));

  document.addEventListener('click', (e)=>{
    const seed = e.target.closest('#seed-party');
    if(seed){
      const sample = [
        { id:"sample1", name:"Kael", level:3, ac:16, hp:28, hpMax:31 },
        { id:"sample2", name:"Nyra", level:3, ac:14, hp:20, hpMax:24 },
        { id:"sample3", name:"Borin", level:3, ac:18, hp:32, hpMax:35 },
        { id:"sample4", name:"Elowen", level:3, ac:13, hp:18, hpMax:20 }
      ];
      save('tp_cc_characters', sample);
      alert('Sample party written to localStorage as tp_cc_characters.');
    }
  });
})();
