const http = require('http');
function post(p){
    return new Promise((r,j)=>{
        const d=JSON.stringify({query:p,top_k:5});
        const req=http.request({hostname:'localhost',port:5000,path:'/api/v1/search',method:'POST',headers:{'Content-Type':'application/json','Content-Length':d.length}},(res)=>{
            let b='';
            res.on('data',c=>b+=c);
            res.on('end',()=>r(b))
        });
        req.on('error',j);
        req.write(d);
        req.end()
    })
}
post('Multi-Agent').then(r=>{
    const j=JSON.parse(r);
    j.results.forEach(rs=>console.log(rs.score.toFixed(3),'['+rs.entity_type+']',rs.content.substring(0,100)))
});
