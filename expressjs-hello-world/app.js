const express = require('express')
const mysql = require('mysql')
const jwt = require('jsonwebtoken')
const app = express()
const port = 3000

app.get('/', (req, res) => res.send('Hello World!'))
app.get('/users/:userId/roles/:roleName/documents', (req, res) => {
    if(!req.header('Authorization')) {
        res.status(400).send('Bad request');
    }else{
        jwt.verify(req.header('Authorization') && req.header('Authorization').split(' ')[1], 'hoangnv', function(err, decoded) {
            if(err){
                res.status(401).send('Unthorized');
            }else{
                pool.getConnection(function(err, connection){
                    if(err) throw err;
                
                    connection.query('select d.* from user_role ur ' +
                    'inner join roles r on ur.user_id = ? and r.name = ? and ur.role_id = r.id ' +
                    'inner join role_permission rp on r.id = rp.role_id ' +
                    'inner join permissions p on rp.permission_id = p.id ' +
                    'inner join permission_action pa on p.id = pa.permission_id ' +
                    'inner join actions a on pa.action_id = a.id and a.name = \'read\' '+
                    'inner join document_permission dp on p.id = dp.permission_id ' +
                    'inner join documents d on dp.document_id = d.id ', 
                    [req.params.userId, req.params.roleName], 
                    function(err, results, fields){
                        connection.release();
                        if(err) throw err
                        getDocumentHiearachy(results.map(result => result.id), function(documents){
                            res.json({
                                "status": 200,
                                "documents": documents
                            });
                        });
                    })
                });
            }
        });
    }
})

function getDocumentHiearachy(rootIds, callback){
    let set = new Set();
    let from2To = new Map();
    let to2From = new Map();

    if(rootIds && rootIds.length === 0){
        callback([]);
    }else{
        loop(rootIds.pop());
    }

    function loop(documentId){
        pool.getConnection(function(err, connection){
            if(err) throw err;
    
            connection.query(`CALL get_hiearachy(${documentId})`, function(err, results, fields){
                connection.release();
                if(err) throw err;
                results[0].forEach(element => {
                    set.add(element.from);
                    set.add(element.to);
                    
                    let toIds = (from2To.get(element.from) || []);
                    toIds.push(element.to);
                    from2To.set(element.from, toIds);

                    let fromIds = (to2From.get(element.to) || []);
                    fromIds.push(element.from);
                    to2From.set(element.to, fromIds);
                });
                if(rootIds.length !== 0){
                    loop(rootIds.pop());
                } else {
                    getAllDocuments(Array.from(set));
                }
            })
        });
    }

    function getAllDocuments(documentIds){
        let id2Document = new Map();
        let data = [];
        pool.getConnection(function(err, connection){
            if(err) throw err;
    
            connection.query('select d.*, a.name as attr_name, dav.value as attr_value from documents as d left join document_attribute_value as dav on d.id IN (?) AND d.id = dav.document_id left join attributes as a on dav.attribute_id = a.id;',
             [documentIds], function(err, results, fields){
                connection.release();
                if(err) throw err;
                results.forEach(result => {
                    let document = id2Document.get(result.id) || Object.assign({}, result);
                    delete document.attr_name;
                    delete document.attr_value;
                    result.attr_name && (document[result.attr_name] = result.attr_value);
                    id2Document.set(result.id, document);

                    let fromIds = to2From.get(document.id);
                    if(fromIds && fromIds.length !== 0){
                        fromIds.forEach(id => {
                            let fromDocument = id2Document.get(id);
                            if(fromDocument){
                                fromDocument.children = (fromDocument.children || []);
                                fromDocument.children.push(document);
                            }
                        })
                    }else{
                        data.push(document);
                    }

                    let toIds = from2To.get(document.id);
                    if(toIds && toIds.length !== 0){
                        toIds.forEach(id => {
                            let toDocument = id2Document.get(id);
                            if(toDocument){
                                document.children = (document.children || []);
                                document.children.push(toDocument);
                            }
                        })
                    }
                });
                callback(data);
            })
        });
    }
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    res.status(404).send('Page not found');
  });

app.listen(port, () => console.log('Example app listening on port ${port}!'))

var pool = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'hoangnv',
    password: '123456a@',
    database: 'bfast'
});