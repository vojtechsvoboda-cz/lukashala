/* Shared by the website and the admin: data model, default layout, row renderer.
   Layout model: every page (overview + each category) is a list of rows.
   Row: {a: horizontal align l|c|r|j, v: vertical align b|c|t, g: space below s|m|l, items: [...]}
   Item: {id, s: size step XS..XL, w?: exact width in % of the content (overrides s)} */
(function(){
  var D=window.LH_DATA;
  var SZ={XS:11,S:20,M:34,L:47,XL:64};       /* desktop width, % of content */
  var GAP=3.4;
  var SIZES=['XS','S','M','L','XL'];
  var MINW=8,MAXW=100;
  function clone(o){return JSON.parse(JSON.stringify(o));}
  function dim(site,id){var x=site&&site.extra&&site.extra[id];return x?[x.w,x.h]:(D.photos[id]||[4,5]);}
  function src(site,id,base){var x=site&&site.extra&&site.extra[id];return x?x.src:(base||'')+id+'.webp';}
  function portrait(site,id){var d=dim(site,id);return d[1]>d[0];}
  function width(it){return it.w!=null?it.w:SZ[it.s]||20;}
  function mobileWidth(w){return Math.min(100,Math.round(w*2+4));}
  function stepOf(w){var best='S',bd=1e9;SIZES.forEach(function(s){var d=Math.abs(SZ[s]-w);if(d<bd){bd=d;best=s;}});return best;}
  function projectOf(site,id){var ps=site.projects;for(var i=0;i<ps.length;i++)if(ps[i].photos.indexOf(id)>-1)return ps[i];return null;}
  function catPhotos(site,cat){var a=[];site.projects.forEach(function(p){if(p.cat===cat&&!p.hidden)a=a.concat(p.photos);});return a;}
  function autoSize(site,id,k,mode){
    var p=portrait(site,id);
    if(mode==='ov')return p?(k%3===2?'S':'M'):(k%2?'M':'L');
    return p?(k%6===1?'XS':'S'):(k%4===1?'S':'M');
  }
  function packRows(site,ids,mode,startK){
    var rows=[],row={a:'c',items:[]},used=0,k=startK||0,max=mode==='ov'?2:4;
    ids.forEach(function(id){
      var s=autoSize(site,id,k++,mode),w=SZ[s],need=used+(row.items.length?GAP:0)+w;
      if(row.items.length&&(need>100||row.items.length>=max||(mode==='ov'&&k%5===0))){rows.push(row);row={a:'c',items:[]};need=w;}
      row.items.push({id:id,s:s});used=need;
    });
    if(row.items.length)rows.push(row);
    if(mode==='ov')rows.forEach(function(r,i){r.a=r.items.length>1?'c':(i%2?'r':'l');});
    return rows;
  }
  function defaultSite(){
    var s={v:1,projects:clone(D.projects),info:clone(D.info),extra:{},layouts:{}};
    s.layouts.overview=packRows(s,D.overview,'ov');
    D.cats.forEach(function(c){s.layouts[c[0]]=packRows(s,catPhotos(s,c[0]),'cat');});
    return s;
  }
  /* keep layouts in sync with projects: drop photos that no longer exist, append new ones as auto rows */
  function syncLayout(site,cat){
    var want=catPhotos(site,cat),rows=site.layouts[cat]||[],seen={};
    rows.forEach(function(r){r.items=r.items.filter(function(it){if(want.indexOf(it.id)<0||seen[it.id])return false;seen[it.id]=1;return true;});});
    rows=rows.filter(function(r){return r.items.length;});
    var add=want.filter(function(id){return !seen[id];});
    if(add.length)rows=rows.concat(packRows(site,add,'cat',want.length));
    site.layouts[cat]=rows;return rows;
  }
  function rowWidth(r){var w=0;r.items.forEach(function(it,i){w+=width(it)+(i?GAP:0);});return w;}
  function rowsHtml(site,rows,o){
    o=o||{};
    return '<div class="lh-rows">'+rows.map(function(r,ri){
      return '<div class="lh-row" data-a="'+(r.a||'c')+'" data-v="'+(r.v||'b')+'" data-g="'+(r.g||'m')+'" data-ri="'+ri+'">'+r.items.map(function(it,ii){
        var d=dim(site,it.id),w=width(it);
        var inner='<img src="'+src(site,it.id,o.base)+'" alt="" width="'+d[0]+'" height="'+d[1]+'"'+(o.lazy===false?'':' loading="lazy"')+' draggable="false">';
        var st='--w:'+w+';--mw:'+mobileWidth(w)+';aspect-ratio:'+d[0]+'/'+d[1];
        return o.href?'<a class="lh-ph" href="'+o.href(it)+'" data-id="'+it.id+'" data-ri="'+ri+'" data-ii="'+ii+'" style="'+st+'">'+inner+'</a>'
                     :'<div class="lh-ph" data-id="'+it.id+'" data-ri="'+ri+'" data-ii="'+ii+'" style="'+st+'">'+inner+'</div>';
      }).join('')+'</div>';
    }).join('')+'</div>';
  }
  /* shared row CSS: used by the website and by the admin canvas so both look identical */
  var CSS='.lh-rows{width:min(1040px,80vw);margin:0 auto}'+
    '.lh-row{display:flex;align-items:flex-end;column-gap:'+GAP+'%;margin-bottom:clamp(30px,5.4vw,64px)}'+
    '.lh-row[data-v="c"]{align-items:center}.lh-row[data-v="t"]{align-items:flex-start}'+
    '.lh-row[data-g="s"]{margin-bottom:clamp(16px,2.4vw,28px)}.lh-row[data-g="l"]{margin-bottom:clamp(56px,10vw,128px)}'+
    '.lh-row[data-a="c"]{justify-content:center}.lh-row[data-a="l"]{justify-content:flex-start}.lh-row[data-a="r"]{justify-content:flex-end}.lh-row[data-a="j"]{justify-content:space-between}'+
    '.lh-ph{display:block;flex:0 1 calc(var(--w)*1%);width:calc(var(--w)*1%);min-width:0}'+
    '.lh-ph img{display:block;width:100%;height:auto;background:#f1f0ee}'+
    '@media (max-width:700px){.lh-rows{width:calc(100vw - 32px)}.lh-row{flex-wrap:wrap;row-gap:16px;column-gap:4%;margin-bottom:34px}'+
    '.lh-ph{flex-basis:calc(var(--mw)*1%);width:calc(var(--mw)*1%)}.lh-row[data-a="j"]{justify-content:center}}';
  window.LH={D:D,SZ:SZ,GAP:GAP,SIZES:SIZES,MINW:MINW,MAXW:MAXW,clone:clone,dim:dim,src:src,portrait:portrait,width:width,mobileWidth:mobileWidth,stepOf:stepOf,
    projectOf:projectOf,catPhotos:catPhotos,packRows:packRows,defaultSite:defaultSite,syncLayout:syncLayout,rowWidth:rowWidth,rowsHtml:rowsHtml,CSS:CSS};
})();
