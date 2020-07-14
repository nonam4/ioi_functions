const admin = require('firebase-admin')
const functions = require('firebase-functions')
admin.initializeApp(functions.config().firebase)
const firestore = admin.firestore()
const cors = require('cors')
const corsHandler = cors({ origin: true })

exports.dados = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    const compare = (vlocal, vserver) => {
      var result = false
      if(typeof vlocal !== 'object'){ vlocal = vlocal.toString().split('.') }
      if(typeof vserver !== 'object'){ vserver = vserver.toString().split('.') }

      for(var i = 0; i < (Math.max(vlocal.length, vserver.length)); i++){
          if(vlocal[i] == undefined){ vlocal[i]= 0 }
          if(vserver[i] == undefined){ vserver[i] = 0 }

          if(Number(vlocal[i]) < Number(vserver[i])){
              result = true
              break
          }
          if(vlocal[i] != vserver[i]){
              break
          }
      }
      return result
    }

    const plataforma = req.query.plataforma
    const sistema = req.query.sistema
    const versao = req.query.versao
    //se a plataforma for o coletor, essa id será a id unica do cliente em /empresas/{dbkey}/clientes/{id}
    //será necessário fazer uma busca no banco de dados pelo documento com a id igual essa id
    switch (plataforma) {
      case 'coletor':

        const id = req.query.id
        const local = req.query.local

        return firestore.doc('/sistema/coletor').get().then(coletor => {

          const server = coletor.data().versao
          var ret = new Object()
          ret.valid = false
          ret.atualizar = compare(versao, server)

          if(ret.atualizar && sistema === 'win32') {
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
        
        return firestore.doc('/sistema/app').get().then(app => {

          const server = app.data().versao
          var ret = new Object()
          ret.atualizar = compare(versao, server)

          if(ret.atualizar) {
            ret.versao = server
            if(sistema === 'android') {
              ret.url = app.data().android
            } else {
              ret.url = app.data().ios
            }
            res.status(200).send(ret)
            return
          } else {
            var usuario = req.query.usuario
            var senha = req.query.senha
            var auth = new Object()
            auth.autenticado = false

            return firestore.collection('/usuarios/').where('usuario', '==', usuario).where('senha', '==', senha).get().then(query => {
              query.forEach(usuario => {
                auth.nome = usuario.data().nome
                auth.usuario = usuario.data().usuario
                auth.senha = usuario.data().senha
                auth.empresa = usuario.data().empresa
                auth.permissao = usuario.data().permissao
                auth.autenticado = true
              })
              ret.auth = auth
              if(auth.autenticado) {
                
                ret.clientes = {}
                ret.atendimentos = {}
                ret.suprimentos = {}
                
                return firestore.collection('/empresas/' + auth.empresa + '/clientes').get().then(query => {
                  query.forEach(cliente => {
                    ret.clientes[cliente.data().id] = cliente.data()
                  })

                  return firestore.collection('/empresas/' + auth.empresa + '/atendimentos').orderBy("ordem", "asc")
                  .where('responsavel', '==', auth.nome).where('feito', '==', false).get().then(query => {
                    query.forEach(atendimento => {
                      if(ret.clientes[atendimento.data().cliente] != undefined) {
                        ret.atendimentos[atendimento.data().id] = atendimento.data()
                        ret.atendimentos[atendimento.data().id].dados = ret.clientes[atendimento.data().cliente]
                      } 
                    })
      
                    return firestore.collection('/empresas/' + auth.empresa + '/suprimentos').get().then(query => {
                      query.forEach(suprimento => {
                        ret.suprimentos[suprimento.data().id] = suprimento.data()
                      })
        
                      res.status(200).send(ret)
                      return
                    })              
                  })
                })
              } else {
                res.status(200).send(ret)
                return
              }
            })
          }
        })
      case 'web':

        var usuario = req.query.usuario
        var senha = req.query.senha
        var auth = new Object()
        auth.autenticado = false

        return firestore.collection('/usuarios/').where('usuario', '==', usuario).where('senha', '==', senha).get().then(query => {
          query.forEach(usuario => {
            auth.nome = usuario.data().nome
            auth.usuario = usuario.data().usuario
            auth.senha = usuario.data().senha
            auth.empresa = usuario.data().empresa
            auth.permissao = usuario.data().permissao
            auth.autenticado = true
          })
          var ret = new Object()
          ret.auth = auth
          if(auth.autenticado) {
            
            ret.usuarios = {}
            ret.clientes = {}
            ret.atendimentos = {}
            ret.suprimentos = {}

            return firestore.doc('/sistema/coletor').get().then(coletor => {
              ret.versao = coletor.data().versao

              return firestore.collection("usuarios").where('empresa', '==', auth.empresa).get().then(query => {
                query.forEach(usuario => {
                  ret.usuarios[usuario.data().id] = usuario.data()
                })
  
                return firestore.collection('/empresas/' + auth.empresa + '/clientes').orderBy("nomefantasia").get().then(query => {
                  query.forEach(cliente => {
                    ret.clientes[cliente.data().id] = cliente.data()
                  })

                  return firestore.collection('/empresas/' + auth.empresa + '/atendimentos').get().then(query => {
                    query.forEach(atendimento => {
                      ret.atendimentos[atendimento.data().id] = atendimento.data()
                    })   

                    return firestore.collection('/empresas/' + auth.empresa + '/suprimentos').get().then(query => {
                      query.forEach(suprimento => {
                        ret.suprimentos[suprimento.data().id] = suprimento.data()
                      })
        
                      res.status(200).send(ret)
                      return
                    })
                  })
                })
              })
            }) 
          } else {
            res.status(200).send(ret)
            return
          }
        })
    }
  })
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
  var mes = data.getMonth() + 1
  if (mes < 10) { mes = "0" + mes }
  var dia = data.getDate()
  if (dia < 10) { dia = "0" + dia }

  var gerarAbastecimento = false

  return firestore.doc('/empresas/' + empresa + '/clientes/' + id).get().then(cliente => {
    var impressoras = new Object()
    if(cliente.data().impressoras != undefined && cliente.data().impressoras[serial] !== undefined) {
      if(cliente.data().impressoras[serial].leituras[ano + "-" + mes] !== undefined) {
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
              leituras: {
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
      }
      //atualiza os niveis de tinta de acordo com a capacidade dele
      if(cliente.data().impressoras[serial].tinta.capacidade !== "ilimitado" && cliente.data().impressoras[serial].ativa) {
        impressoras.impressoras[serial].tinta = new Object()
        impressoras.impressoras[serial].tinta.impresso = leitura - cliente.data().impressoras[serial].tinta.cheio
        var nivel = parseInt(100 - ((100 * impressoras.impressoras[serial].tinta.impresso) / cliente.data().impressoras[serial].tinta.capacidade))
        if(nivel <= 0) {
          impressoras.impressoras[serial].tinta.nivel = 0
          gerarAbastecimento = true
        } else {
          impressoras.impressoras[serial].tinta.nivel = nivel
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
      if(gerarAbastecimento) {
        gerarAtendimento(res, id, empresa, ano + '-' + mes + '-' + dia)
      } else {
        res.status(200).send("ok")
        return
      }
    })
  })
})

const gerarAtendimento = (res, id, empresa, data) => {
  return firestore.doc('/empresas/' + empresa + '/atendimentos/' + id).get().then(query => {
    
    var atendimento = new Object()
    atendimento.cliente = id
    atendimento.datas = {
      inicio: data,
      fim: ''
    }
    atendimento.feito = false
    atendimento.id = id
    atendimento.motivo = ['Abastecimento']
    atendimento.ordem = 0
    atendimento.responsavel = ''

    if (query.exists && !query.data().feito && query.data().responsavel != '') {
      atendimento.responsavel = query.data().responsavel
    } 
  
    return firestore.doc('/empresas/' + empresa + '/atendimentos/' + id).set(atendimento, {merge: true}).then(() => {
      res.status(200).send("ok")
      return
    })
  })  
}

exports.notificacao = functions.firestore.document('empresas/{empresa}/atendimentos/{atendimento}').onWrite((change, context) => {
    
  const atendimento = change.after.data()
  if(atendimento != undefined && !atendimento.feito) {

    const atual = new Date()
    const diferenca = ultima => {

      var dif = (atual.getTime() - ultima.getTime()) / 1000
      dif /= 60
      return Math.abs(Math.round(dif))
    }
    
    const responsavel = atendimento.responsavel
    const empresa = context.params.empresa
    var token
    var id
    var notificacao

    return admin.firestore().collection('usuarios').where('empresa', '==', empresa).where('nome', '==', responsavel).get().then(query => {
      query.forEach(usuario => {
        token = usuario.data().token
        id = usuario.data().id
        notificacao = usuario.data().notificacao
      })

      if(token != undefined && token != '') {
        if(notificacao != undefined && notificacao != '') {
          if(diferenca(notificacao.toDate()) > 30) {
            gravarData(id, token, atual)
          }
        } else {
          gravarData(id, token, atual)
        }
      }
    })
  }
})

const gravarData = (id, token, data) => {
  return firestore.doc('/usuarios/' + id).set({
    notificacao: data
  }, {merge: true}).then(() => {

    var notificacao = {
      notification: {
        title: 'Atendimentos Atualizados',
        body: 'Atualize os dados dentro do app para ver as alterações!'
      }, token: token
    }

    admin.messaging().send(notificacao).then(response => {
      console.log('Notificação enviada com sucesso!')
    }).catch(error => {
      console.log('Erro enviando notificação: ' + error)
    })
  })
}

/*
* funções de controle do site
* toda requisição deverá ser autenticada e permissões devem ser verificadas
*/
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
        auth.permissao = usuario.data().permissao
        auth.id = usuario.data().id
        auth.autenticado = true
      })
      res.status(200).send(auth)
      return
    })
  })
})

exports.gravarToken = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    const id = req.query.id
    const token = req.query.token

    return firestore.doc('/usuarios/' + id).set({ token: token }, {merge: true}).then(() => {
      res.status(200).send('ok')
      return
    })
  })
})

exports.gravarCliente = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    const usuario = req.body.usuario
    const senha = req.body.senha
    var auth = new Object()
    auth.autenticado = false

    return firestore.collection('/usuarios/').where('usuario', '==', usuario).where('senha', '==', senha).get().then(query => {
      query.forEach(usuario => {
        auth.permissao = usuario.data().permissao
        auth.autenticado = true
        auth.empresa = usuario.data().empresa
      })
      if(auth.autenticado) {
        if(auth.permissao.criar || auth.permissao.modificar) {

          auth.erro = false
          var cliente = JSON.parse(req.body.cliente)
          cliente.empresa = auth.empresa
          return firestore.doc('/empresas/' + auth.empresa + '/clientes/' + cliente.id).set(cliente, {merge: true}).then(() => {
            res.status(200).send(auth)
            return
          })
        } else {
          auth.erro = true
          auth.msg = "Usuário sem permissão! Nenhuma alteração foi realizada!"
          res.status(200).send(auth)
          return
        }
      } else {
        res.status(200).send(auth)
        return
      }
    })
  })
})

exports.gravarAtendimentos = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    const usuario = req.query.usuario
    const senha = req.query.senha
    var auth = new Object()
    auth.autenticado = false

    return firestore.collection('/usuarios/').where('usuario', '==', usuario).where('senha', '==', senha).get().then(query => {
      query.forEach(usuario => {
        auth.permissao = usuario.data().permissao
        auth.autenticado = true
        auth.empresa = usuario.data().empresa
      })
      if(auth.autenticado) {
        if(auth.permissao.criar || auth.permissao.modificar) {
          auth.erro = false
          var batch = firestore.batch()
          var atendimentos = JSON.parse(req.query.atendimentos)

          for(var y = 0; y < Object.keys(atendimentos).length; y++) {
            var atendimento = atendimentos[Object.keys(atendimentos)[y]]   
        
            var ref = firestore.doc('/empresas/' + auth.empresa + '/atendimentos/' + atendimento.id)
            batch.set(ref, atendimento, {merge: true})
          }

          batch.commit().then(() => {
            res.status(200).send(auth)
            return
          })
        } else {
          auth.erro = true
          auth.msg = "Usuário sem permissão! Nenhuma alteração foi realizada!"
          res.status(200).send(auth)
          return
        }
      } else {
        res.status(200).send(auth)
        return
      }
    })
  })
})

exports.gravarSuprimentos = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    const usuario = req.query.usuario
    const senha = req.query.senha
    var auth = new Object()
    auth.autenticado = false

    return firestore.collection('/usuarios/').where('usuario', '==', usuario).where('senha', '==', senha).get().then(query => {
      query.forEach(usuario => {
        auth.permissao = usuario.data().permissao
        auth.autenticado = true
        auth.empresa = usuario.data().empresa
      })
      if(auth.autenticado) {
        if(auth.permissao.criar || auth.permissao.modificar) {
          auth.erro = false
          var batch = firestore.batch()
          var suprimentos = JSON.parse(req.query.suprimentos)

          for(var y = 0; y < Object.keys(suprimentos).length; y++) {
            var suprimento = suprimentos[Object.keys(suprimentos)[y]]   
        
            var ref = firestore.doc('/empresas/' + auth.empresa + '/suprimentos/' + suprimento.id)
            batch.set(ref, suprimento, {merge: true})
          }

          batch.commit().then(() => {
            res.status(200).send(auth)
            return
          })
        } else {
          auth.erro = true
          auth.msg = "Usuário sem permissão! Nenhuma alteração foi realizada!"
          res.status(200).send(auth)
          return
        }
      } else {
        res.status(200).send(auth)
        return
      }
    })
  })
})