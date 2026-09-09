import {expect,it} from 'vitest';
import {toggleAnswer} from './answers';
const q={id:'focus',title:'Упор',multiple:true,exclusive:'Всё',options:['Всё','Чтение','Письмо']};
it('переключает несколько вариантов, сохраняя порядок и исключающий ответ',()=>{
 expect(toggleAnswer(q,'Чтение','Письмо')).toBe('Чтение\nПисьмо');
 expect(toggleAnswer(q,'Чтение\nПисьмо','Чтение')).toBe('Письмо');
 expect(toggleAnswer(q,'Чтение','Всё')).toBe('Всё');
 expect(toggleAnswer(q,'Всё','Письмо')).toBe('Письмо');
 expect(toggleAnswer(q,'Письмо','Письмо')).toBe('');
});
it('в старом контракте и одиночном вопросе заменяет ответ',()=>{
 expect(toggleAnswer({...q,multiple:undefined},'Чтение','Письмо')).toBe('Письмо');
});
