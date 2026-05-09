// 1. Ativação do Cofre (Deve ser a linha 1)
require('dotenv').config();

// --- IMPORTAÇÕES ---
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('@supabase/supabase-js'); // <-- Injeção do Supabase

const app = express();
app.use(cors());
app.use(express.json());
// Rota de Keep-Alive para evitar que o Render hiberne
app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'ativo', mensagem: 'Servidor acordado' });
});

// --- CONFIGURAÇÃO INICIAL ---
// Conexão Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Conexão Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- ROTA DE INTEGRAÇÃO ---
app.post("/pesquisar", async (req, res) => {
    // Captura o input do usuário vindo do fetch() da barra de pesquisa 
    const { textoUsuario } = req.body; 

    try {
        // 1. Módulo IA: Classificação (Controle em Roxo)
        const systemPrompt = "Classifique em uma palavra: [recicláveis, eletronico, movel, entulho, oleo, lampada]. Responda apenas o JSON: {\"categoria\": \"valor\"}";
        
        // É aqui que mandamos a pergunta de fato para a IA:
        const result = await model.generateContent(`${systemPrompt} \n Item: ${textoUsuario}`);

        const textoIA = result.response.text().replace(/```json|```/g, "").trim();
        const categoriaResposta = JSON.parse(textoIA).categoria;

        console.log(`\n--- NOVA PESQUISA ---`);
        console.log(`Item recebido: ${textoUsuario}`);
        console.log(`Classificação da IA: ${categoriaResposta}`);
        console.log(`---------------------\n`);

        // 2. Módulo de Busca: Filtro Direto na Nuvem (Supabase)
        // O .eq atua exatamente como o antigo .filter() da sua Array local
        const { data: locaisProximos, error } = await supabase
            .from('Ecopontos_lorena') // Nome exato da tabela no Supabase
            .select('*')
            .eq('tipo', categoriaResposta); 

        // Se a conexão com o Supabase falhar, ele aciona o Catch abaixo
        if (error) throw error; 

        // 3. Resposta de Saída (Contrato em Laranja) 
        return res.json({
            "status": "sucesso",
            "mensagem_chat": `O item "${textoUsuario}" foi classificado como ${categoriaResposta}.`,
            "dados_mapa": locaisProximos // Lista filtrada vinda da nuvem
        });

    } catch (error) {
        // Retorna onde o Erro Ocorreu
        console.error("\n[ ERRO DETALHADO DO SERVIDOR ]:", error);

        // Fallback se a IA falhar ou o Banco de Dados cair
        return res.status(500).json({ 
            "status": "erro", 
            "mensagem_chat": "Não consegui identificar este resíduo no momento ou houve falha de conexão com a base de dados." 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Ponto Verde rodando na porta ${PORT}`));