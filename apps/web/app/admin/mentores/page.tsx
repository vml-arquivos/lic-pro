import { redirect } from 'next/navigation';

/** Endereço antigo: alunos, mentores e materiais agora ficam na Administração da mentoria. */
export default function Moved() {
  redirect('/gestao/mentores');
}
