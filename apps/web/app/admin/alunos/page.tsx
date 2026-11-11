import { redirect } from 'next/navigation';

/** Endereço antigo: alunos, mentores e materiais agora ficam na Administração do curso. */
export default function Moved() {
  redirect('/gestao/alunos');
}
