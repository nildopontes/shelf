const CLIENT_ID = '203341534695-0fqu5vbr36g9sgir4ouh4k5ivl0un99g.apps.googleusercontent.com';
const API_KEY = 'AIzaSyCt1VlOA34M-E04P-bn6uc2Qc2N0CF1fbI';
const SCOPE = "https://www.googleapis.com/auth/drive.file";
var client = null;
var access_token = null;

function initClient(){
   client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      prompt: '',
      callback: tokenResponse => {
         access_token = tokenResponse.access_token;
         sessionStorage.setItem('secureToken', access_token);
         sessionStorage.setItem('expireToken', parseInt(Date.now()/1000, 10) + tokenResponse.expires_in - 60); // 60 segundos de margem de segurança
         console.log(access_token);
      },
   });
}
function revokeToken(){
   google.accounts.oauth2.revoke(access_token, () => {console.log('access token revoked')});
}
/*
Gera um novo token de acesso OAuth ou retorna o atual caso ainda esteja válido
*/
function newToken(){
   return  new Promise((resolve, reject) => {
      if(sessionStorage.getItem('secureToken') !== null && parseInt(Date.now()/1000, 10) < parseInt(sessionStorage.getItem('expireToken'), 10)){
         resolve(sessionStorage.getItem('secureToken'));
      }else{
         client.requestAccessToken();
         resolve(access_token);
      }
   });
}
/*
Envia os metadados dos arquivo para o Google Drive. Somente os metadados.
@param {String} fileName - o nome do arquivo
@param {String} token - o token de acesso ao GDrive
*/
function sendMetadata(fileName, token){
   const data = JSON.stringify({
      "name": fileName,
      "parents": ["1X2-YwiGQPG06DkFgcCXivn6RIKAg5H5B"]
   });
   const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
   return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-type', 'application/json');
      xhr.setRequestHeader('X-Upload-Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onreadystatechange = function() {
         if(xhr.readyState == 4){
            if([200, 206].includes(xhr.status)){
               var headers = xhr.getAllResponseHeaders();
               const arr = headers.trim().split(/[\r\n]+/);
               const headerMap = {};
               arr.forEach((line) => {
                  const parts = line.split(": ");
                  const header = parts.shift();
                  const value = parts.join(": ");
                  headerMap[header] = value;
               });
               resolve(headerMap['location']);
            }else{
               reject(xhr.status);
            }
         }
      }
      xhr.send(data);
   });
}
/*
Envia os dados de um arquivo para o GDrive, uma vez que os metadados já foram enviados com a função sendMetadata()
@param {Uint8Array/String} data - o conteúdo do arquivo
@param {String} pathResumable - o path para o arquivo obtido na função sendMetadata()
@param {String} token - o token de acesso ao GDrive
*/
function sendFile(data, pathResumable, token){
   return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.responseType = 'json';
      xhr.open('PUT', pathResumable, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onreadystatechange = function() {
         if(xhr.readyState == 4){
            if([200, 201, 206].includes(xhr.status)){
               resolve(xhr.response.id);
            }else{
               reject(`Error: status code ${xhr.status}.`);
            }
         }
      }
      xhr.send(data);
   });
}
/*
Recupera informações da Conta Google do usuário logado
@param {String} token - o token de acesso ao GDrive
*/
function getAbout(token){
   let url = `https://www.googleapis.com/drive/v2/about`;
   return new Promise((resolve, reject) => {
      if(sessionStorage.getItem('aboutUser') !== null){
         resolve(JSON.parse(sessionStorage.getItem('aboutUser')));
      }else{
         var xhr = new XMLHttpRequest();
         xhr.responseType = 'json';
         xhr.open('GET', url, true);
         xhr.setRequestHeader('Authorization', `Bearer ${token}`);
         xhr.onreadystatechange = function(){
            if(xhr.readyState == 4){
               if([200].includes(xhr.status)){
                  sessionStorage.setItem('aboutUser', JSON.stringify(xhr.response));
                  resolve(xhr.response);
               }else{
                  reject(`Error: status code ${xhr.status}`);
               }
            }
         }
         xhr.send();
      }
   });
}
/*
Lista os arquivos de uma pasra do Google Drive e devolve em um JSON ordenado pelo mais recente.
@param {String} id - o id da pasta no GDrive
@param {Interger} amount - a quantidade de arquivos por requisição
*/
function listInFolder(id, amount){
   let url = `https://www.googleapis.com/drive/v3/files?key=${API_KEY}&q='${id}'+in+parents&pageSize=${amount}&orderBy=recency`;
   return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.responseType = 'json';
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function(){
         if(xhr.readyState == 4){
            if([200, 206].includes(xhr.status)){
               resolve(xhr.response);
            }else{
               reject(`Error: status code ${xhr.status}`);
            }
         }
      }
      xhr.send();
   });
}
/*
Compartilha um arquivo do Google Drive para ficar público para qualquer pessoa com o link
@param {String} token - o token de acesso à API do GDrive
@param {Interger} id - o ID do arquivo
*/
function publishFile(token, id){
   let permission = JSON.stringify({
      "type": "anyone",
      "role": "reader",
   });
   const url = `https://www.googleapis.com/drive/v3/files/${id}/permissions`;
   return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onreadystatechange = function(){
         if(xhr.readyState == 4){
            if([200, 206].includes(xhr.status)){
               resolve(`https://drive.google.com/uc?export=download&id=${id}`);
            }else{
               reject(`Error: status code ${xhr.status}`);
            }
         }
      }
      xhr.send(permission);
   });
}
/*
Deleta um arquivo armazendo no Google Drive
@param {String} token - o token de acesso ao GDrive
@param {String} id - o id do arquivo
*/
function trashFile(token, id){
   const url = `https://www.googleapis.com/drive/v2/files/${id}`;
   return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.responseType = 'arraybuffer';
      xhr.open('DELETE', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onreadystatechange = function() {
         if(xhr.readyState == 4){
            ([200, 206, 204].includes(xhr.status)) ? resolve('Ok') : reject(`Error: status code ${xhr.status}`);
         }
      }
      xhr.send();
   });
}
/*
Baixa e descriptografa uma música armazenda no Google Drive
@param {String} token - o token de acesso ao GDrive
@param {String} id - o id do arquivo
@param {String} type - o tipo de arquivo que deve ser retornado: 'arraybuffer', 'json', 'blob', 'document', 'text'
*/
function getFile(token, id, type){
   const url = `https://content.googleapis.com/drive/v2/files/{ID}?alt=media&key={API_KEY}`;
   return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.responseType = type;
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function() {
         if(xhr.readyState == 4){
            if([200, 206].includes(xhr.status)){
               resolve(xhr.response);
            }else{
               reject(`Error: status code ${xhr.status}`);
            }
         }
      }
      xhr.send();
   });
}
/*
Cria uma pasta no Goggle Drive
@param {String} name - o nome da pasta 
@param {String} token - o token de acesso à API do GDrive
*/
function createFolder(name, token){
   const data = JSON.stringify({
      "name": name,
      "mimeType": "application/vnd.google-apps.folder",
   });
   const url = 'https://www.googleapis.com/drive/v3/files';
   return new Promise((resolve, reject)=>{
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onreadystatechange = function() {
         if(xhr.readyState >= 3 && [200, 206].includes(xhr.status)){
            console.log(xhr.responseText);
            resolve();
         }
      }
      xhr.send(data);
   });
}
/*
Altera o conteúdo do arquivo de database
@param {Uint8Array/String} data - o novo conteúdo do arquivo
@param {String} id - o id do arquivo
@param {String} token - o token de acesso ao GDrive
*/
function updateFile(data, id, token){
   if(data.length == 0) return;
   var url = `https://www.googleapis.com/upload/drive/v3/files/${id}`;
   return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open('PATCH', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onreadystatechange = function() {
         if(xhr.readyState == 4){
            if(xhr.status === 200){
               resolve(xhr.responseText);
            }else{
               reject(`HTTP status code ${xhr.status}.`);
            }
         }
      }
      xhr.send(data);
   });
}
/*
Faz logout
*/
function logout(){
   revokeToken();
   sessionStorage.removeItem('secureToken');
   sessionStorage.removeItem('expireToken');
   sessionStorage.removeItem('aboutUser');
   
}
/*
Converte um ArrayBuffer para string hexadecimal
@param {ArrayBuffer} buffer - um ArrayBuffer a ser convertido para string hexadecimal
*/
function buf2hex(buffer){
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}