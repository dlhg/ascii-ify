export const EDGE_CHARSETS = [
  {
    name: 'box-light',
    chars: { h: '─', v: '│', dr: '┌', dl: '┐', ur: '└', ul: '┘', cross: '┼', diagR: '╱', diagL: '╲' },
  },
  {
    name: 'box-heavy',
    chars: { h: '━', v: '┃', dr: '┏', dl: '┓', ur: '┗', ul: '┛', cross: '╋', diagR: '╱', diagL: '╲' },
  },
  {
    name: 'box-double',
    chars: { h: '═', v: '║', dr: '╔', dl: '╗', ur: '╚', ul: '╝', cross: '╬', diagR: '╱', diagL: '╲' },
  },
  {
    name: 'ascii',
    chars: { h: '-', v: '|', dr: '+', dl: '+', ur: '+', ul: '+', cross: '+', diagR: '/', diagL: '\\' },
  },
];
