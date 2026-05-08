// Escreva aqui o lixo que você quer testar
const lixoParaTestar = "casca de banana e resto de feijão";

console.log(`Enviando "${lixoParaTestar}" para o servidor...`);

fetch('http://localhost:3000/pesquisar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ textoUsuario: lixoParaTestar })
})
.then(resposta => resposta.json())
.then(dados => {
    // Esse é o print da resposta final que o Frontend receberia
    console.log("Resposta final do servidor:", dados);
})
.catch(erro => console.error("Erro na comunicação:", erro));