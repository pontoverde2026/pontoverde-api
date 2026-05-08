// 1. Ativação do Cofre (Deve ser a linha 1)
require('dotenv').config();

// --- IMPORTAÇÕES (Verde/Esmeralda) ---
const express = require('express');
const cors = require('cors'); // <-- Importa o CORS
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs'); 

const app = express();
app.use(cors()); // <-- Avisa o servidor para aceitar requisições de fora
app.use(express.json());

// --- CONFIGURAÇÃO INICIAL ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Carrega o arquivo JSON uma única vez no início (stand-by) 
const baseDados = JSON.parse(fs.readFileSync('./ecopontos_lorena.json', 'utf8'));

// --- ROTA DE INTEGRAÇÃO ---
app.post("/pesquisar", async (req, res) => {
    // Captura o input do usuário vindo do fetch() da barra de pesquisa 
    const { textoUsuario } = req.body; 

    try {
        // 1. Módulo IA: Classificação (Controle em Roxo)
        const systemPrompt = "Classifique em uma palavra: [eletronico, movel, entulho, oleo, lampada]. Responda apenas o JSON: {\"categoria\": \"valor\"}";
        
        // É aqui que mandamos a pergunta de fato para a IA:
        const result = await model.generateContent(`${systemPrompt} \n Item: ${textoUsuario}`);

        // No lugar da linha da categoria, use isto para maior segurança:
        const textoIA = result.response.text().replace(/```json|```/g, "").trim();
        const categoriaResposta = JSON.parse(textoIA).categoria;

        // ---> ADICIONE ESTES PRINTS AQUI <---
        console.log(`\n--- NOVA PESQUISA ---`);
        console.log(`Item recebido: ${textoUsuario}`);
        console.log(`Classificação da IA: ${categoriaResposta}`);
        console.log(`---------------------\n`);

        // 2. Módulo de Busca: Filtro no JSON (Ação em Amarelo)
        // Procura no banco carregado os pontos que batem com a categoria da IA
        const locaisProximos = baseDados.filter(ponto => ponto.tipo === categoriaResposta);

        // 3. Resposta de Saída (Contrato em Laranja) 
        return res.json({
            "status": "sucesso",
            "mensagem_chat": `O item "${textoUsuario}" foi classificado como ${categoriaResposta}.`,
            "dados_mapa": locaisProximos // Lista com nome, lat e long 
        });

    } catch (error) {
        // Retorna onde o Erro Ocorreu
        console.error("\n[ ERRO DETALHADO DO SERVIDOR ]:", error);

        // Fallback se a IA falhar ou o JSON estiver corrompido 
        return res.status(500).json({ 
            "status": "erro", 
            "mensagem_chat": "Não consegui identificar este resíduo no momento." 
        });
    }
});

app.listen(3000, () => console.log("Servidor ativo na porta 3000"));