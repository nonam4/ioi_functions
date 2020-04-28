const admin = require('firebase-admin')
const functions = require('firebase-functions')
admin.initializeApp(functions.config().firebase)
const firestore = admin.firestore()
const cors = require('cors')
const corsHandler = cors({ origin: true })

exports.dados = functions.https.onRequest((req, res) => {

  const compare = (vlocal, vserver) => {
    var result = false
    for (var i = 0; i < ( Math.max(vlocal.split('.').length, vserver.split('.').length)); i++){
      if(vlocal[i] === undefined){ vlocal[i] = 0 }
      if(vserver[i] === undefined){ vserver[i] = 0 }

      if(Number(vlocal[i]) < Number(vserver[i])){
        result = true
        break
      }
      if(vlocal[i] !== vserver[i]){
        break
      }
    }
    return result
  }

  const plataforma = req.query.plataforma
  const sistema = req.query.sistema
  const versao = req.query.versao
  const id = req.query.id
  const local = req.query.local

  //se a plataforma for o coletor, essa id será a id unica do cliente em /empresas/{dbkey}/clientes/{id}
  //será necessário fazer uma busca no banco de dados pelo documento com a id igual essa id
  switch (plataforma) {
    case 'coletor':
      return firestore.doc('/sistema/coletor').get().then(coletor => {

        var data = new Date()
        var ano = data.getFullYear()
        var mes = data.getMonth() + 1;
        (mes < 10) ? mes = "0" + mes : 0;

        const server = coletor.data().versao
        var ret = new Object()
        ret.valid = false
        ret.atualizar = compare(versao, server)

        if(ret.atualizar) {
          ret.versao = server
          if(sistema === 'win32') {
            ret.url = coletor.data().windows
          } else {
            ret.url = coletor.data().linux
          }
          res.status(200).send(ret)
          return
        } else {
          return firestore.collectionGroup("clientes").where('id', '==', id).get().then(query => {
            query.forEach((cliente) => {
              ret.valid = true
              ret.cliente = cliente.data()
            })
            return firestore.doc('/empresas/' + ret.cliente.empresa + '/clientes/' + id).set({
              sistema: {
                local: local,
                versao: versao
              }
            }, {merge: true}).then(() => {
              res.status(200).send(ret)
              return
            })
          })
        }
      })
    case 'mobile':
      res.status(200).send("mobile")
      break
    case 'web':
      res.status(200).send("web")
      break
  }
})

exports.gravarImpressora = functions.https.onRequest((req, res) => {

  const id = req.query.id
  const empresa = req.query.empresa

  const serial = req.query.serial
  const modelo = req.query.modelo
  const leitura = parseInt(req.query.leitura)
  const ip = req.query.ip

  var data = new Date()
  var ano = data.getFullYear()
  var mes = data.getMonth() + 1;
  (mes < 10) ? mes = "0" + mes : 0;
  var dia = data.getDay() + 1;
  (dia < 10) ? dia = "0" + dia : 0;

  return firestore.doc('/empresas/' + empresa + '/clientes/' + id).get().then(cliente => {
    var impressoras = new Object()
    console.log("impressora undefined? ", cliente.data().impressoras[serial] === undefined)
    if(cliente.data().impressoras[serial] !== undefined) {
      if(cliente.data().impressoras[serial].ativa) {
        //se a impressora existir e for ativa
        console.log("leituras undefined? ", cliente.data().impressoras[serial].leituras[ano + "-" + mes].inicial === undefined)
        if(cliente.data().impressoras[serial].leituras[ano + "-" + mes].inicial.valor !== undefined) {
          //se já tiver o primeiro registro de leitura do mês
          impressoras = {
            impressoras: {
              [serial]: {
                leituras: {
                  [ano + "-" + mes]: {
                    final: {
                      valor: leitura,
                      dia: dia
                    }
                  }
                }
              }
            }
          }
        } else {
          //caso seja um mês novo
          impressoras = {
            impressoras: {
              [serial]: {
                [ano + "-" + mes]: {
                  inicial: {
                    valor: leitura,
                    dia: dia
                  }, final: {
                    valor: leitura,
                    dia: dia
                  }
                }
              }
            }
          }
        }
        //atualiza os niveis de tinta de acordo com a capacidade dele
        if(cliente.data().impressoras[serial].tinta.capacidade !== "ilimitado") {
          impressoras.impressoras[serial].tinta = new Object()
          impressoras.impressoras[serial].tinta.impresso = leitura - cliente.data().impressoras[serial].tinta.cheio
          impressoras.impressoras[serial].tinta.nivel = parseInt(100 - ((100 * impressoras.impressoras[serial].tinta.impresso) / cliente.data().impressoras[serial].tinta.capacidade))
        }
      }
    } else {
      //caso seja uma impressora nova
      impressoras = {
        impressoras: {
          [serial]: {
            franquia: 0,
            ip: ip,
            modelo: modelo,
            setor: "Não informado",
            ativa: true,
            tinta: {
              capacidade: "ilimitado",
              cheio: leitura,
              impresso: 0,
              nivel: 100
            }, leituras: {
              [ano + "-" + mes]: {
                inicial : {
                  valor: leitura,
                  dia: dia
                }, final : {
                  valor: leitura,
                  dia: dia
                }
              }
            }
          }
        }
      }
    }
    return firestore.doc('/empresas/' + empresa + '/clientes/' + id).set(impressoras, {merge: true}).then(() => {
      res.status(200).send("ok")
      return
    })
  })
})

exports.autenticar = functions.https.onRequest((req, res) => {

  corsHandler(req, res, async () => {
    const usuario = req.query.usuario
    const senha = req.query.senha
    var auth = new Object()
    auth.autenticado = false

    return firestore.collection('/usuarios/').where('usuario', '==', usuario).where('senha', '==', senha).get().then(query => {
      query.forEach(usuario => {
        auth.nome = usuario.data().nome
        auth.usuario = usuario.data().usuario
        auth.senha = usuario.data().senha
        auth.empresa = usuario.data().empresa
        auth.autenticado = true
      })
      res.status(200).send(auth)
      return
    })
  })
})
